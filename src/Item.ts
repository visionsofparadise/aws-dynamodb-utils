import { get } from 'lodash';
import pick from 'lodash/pick';
import { Database } from './Database';
import { ILogger } from './ILogger';

export type RequiredKeys<Data extends object, Keys extends keyof Data> = Pick<Data, Keys> & Partial<Omit<Data, Keys>>;
export type OptionalKeys<Data extends object, Keys extends keyof Data> = Omit<Data, Keys> & Partial<Pick<Data, Keys>>;

export interface IItemConfig<PrimaryKey, Schema> {
	keys: Array<PrimaryKey>;
	validator: (data: Schema) => boolean;
	db: Database;
	logger?: ILogger;
	onValidate?: () => Promise<any> | any;
	onSave?: () => Promise<any> | any;
	onCreate?: () => Promise<any> | any;
	onDelete?: () => Promise<any> | any;
}

export class Item<Schema extends object, PrimaryKey extends keyof Schema> {
	protected _initial: Schema;
	protected _current: Schema;
	config: IItemConfig<PrimaryKey, Schema>;

	constructor(props: Schema, config: IItemConfig<PrimaryKey, Schema>) {
		this._initial = props;
		this._current = props;
		this.config = config;
	}

	public get data() {
		return this._current;
	}

	public set(data: Partial<Schema>) {
		this._current = { ...this._current, ...data };

		if (this.config.logger) this.config.logger.info(this._current);

		return;
	}

	public get init() {
		return this._initial;
	}

	public get key() {
		return pick(this._current, this.config.keys);
	}

	public validate = async () => {
		if (this.config.onValidate) await this.config.onValidate();

		const result = this.config.validator(this._current);

		if (!result) throw new Error('Validation failed');

		return result;
	};

	public save = async () => {
		if (this.config.onSave) await this.config.onSave();

		await this.validate();

		await this.config.db.put({
			Item: this._current
		});

		return this;
	};

	public create = async () => {
		if (this.config.onSave) await this.config.onSave();
		if (this.config.onCreate) await this.config.onCreate();

		await this.validate();

		await this.config.db.create(this.key, {
			Item: this._current
		});

		return this;
	};

	public update = async (data: Partial<Schema>) => {
		this.set(data);

		await this.validate();

		let untrimmedUpdateExpression = 'SET ';
		let ExpressionAttributeValues = {};

		for (const key of Object.keys(data)) {
			untrimmedUpdateExpression += `${key} = :${key}, `;
			ExpressionAttributeValues = {
				...ExpressionAttributeValues,
				[`:${key}`]: get(data, key)
			};
		}

		const UpdateExpression = untrimmedUpdateExpression.slice(0, untrimmedUpdateExpression.length - 2);

		await this.config.db.update<Schema>({
			Key: this.key,
			UpdateExpression,
			ExpressionAttributeValues
		});

		return this;
	};

	public refresh = async () => {
		const newData = await this.config.db.get<Schema>({
			Key: this.key
		});

		return this.set(newData);
	};

	public delete = async () => {
		if (this.config.onDelete) await this.config.onDelete();

		await this.config.db.delete({
			Key: this.key
		});

		return;
	};
}
