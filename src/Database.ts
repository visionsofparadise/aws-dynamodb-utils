import { DocumentClient } from 'aws-sdk/clients/dynamodb';
import get from 'lodash/get';
import pick from 'lodash/pick';
import { ILogger } from './ILogger';

type WithDefaults<I> = Omit<I, 'TableName'>;

export interface IItems<Item extends object> {
	Items?: Array<Item> | undefined;
	LastEvaluatedKey?: DocumentClient.Key;
}

export interface IDatabaseProps {
	documentClient: DocumentClient;
	tableName: string;
	logger?: ILogger;
}

export class Database {
	protected _documentClient: DocumentClient;
	protected _queryDefaults: {
		TableName: string;
	};
	protected _logger?: ILogger;

	constructor(props: IDatabaseProps) {
		this._documentClient = props.documentClient;
		this._queryDefaults = {
			TableName: props.tableName
		};
		this._logger = props.logger;
	}

	public get = async <Data extends object>(query: WithDefaults<DocumentClient.GetItemInput>) => {
		const data = await this._documentClient.get({ ...this._queryDefaults, ...query }).promise();

		if (!data || !data.Item || (typeof data === 'object' && Object.keys(data).length === 0)) {
			throw new Error('Item Not Found');
		}

		if (this._logger) this._logger.info(data.Item);

		return data.Item as Promise<Data>;
	};

	public put = async <Data extends object>(query: WithDefaults<DocumentClient.PutItemInput>) => {
		const data = await this._documentClient
			.put({
				...this._queryDefaults,
				...query
			})
			.promise()
			.then(result => result.Attributes as Data);

		if (this._logger) this._logger.info(data);

		return data;
	};

	public create = async (Key: DocumentClient.Key, query: WithDefaults<DocumentClient.PutItemInput>) => {
		try {
			await this.get({ Key });
		} catch (error) {
			return this.put({
				...this._queryDefaults,
				...query
			});
		}

		throw new Error('Item already exists');
	};

	public update = async <Data extends object>(query: WithDefaults<DocumentClient.UpdateItemInput>) => {
		const data = await this._documentClient
			.update({
				...this._queryDefaults,
				...query
			})
			.promise()
			.then(result => result.Attributes as Data);

		if (this._logger) this._logger.info(data);

		return data;
	};

	public query = async <Data extends object>(query: WithDefaults<DocumentClient.QueryInput>) => {
		const data = (await this._documentClient.query({ ...this._queryDefaults, ...query }).promise()) as IItems<Data>;

		if (this._logger) this._logger.info(data);

		return data;
	};

	public scan = async <Data extends object>(query?: WithDefaults<DocumentClient.ScanInput>) => {
		const data = (await this._documentClient
			.scan({ ...this._queryDefaults, ...query })
			.promise()) as unknown as IItems<Data>;

		if (this._logger) this._logger.info(data);

		return data;
	};

	public delete = async (query: WithDefaults<DocumentClient.DeleteItemInput>) => {
		await this.get(query);

		return this._documentClient
			.delete({
				...this._queryDefaults,
				...query
			})
			.promise();
	};

	public reset = async (keys: Array<string>, systemKey?: string) => {
		const scanData = await this.scan();

		for (const data of scanData.Items!) {
			if (!systemKey || !get(data, systemKey)) {
				await this.delete({
					Key: pick(data, keys)
				});
			}
		}

		return;
	};
}
