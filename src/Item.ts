import { get as lodashGet, omit } from 'lodash';
import { Database } from './Database';
import { ILogger } from './ILogger';

export type RequiredProperties<Data extends object, Properties extends keyof Data> = Pick<Data, Properties> &
	Partial<Omit<Data, Properties>>;
export type OptionalProperties<Data extends object, Properties extends keyof Data> = Omit<Data, Properties> &
	Partial<Pick<Data, Properties>>;
export interface SelfItem<Key extends object, Properties extends object> {
	db: Database;
	logger?: ILogger;

	keyGen: {
		[x in keyof Key]: (props: any) => Record<x, string>;
	};

	validator: (props: Properties) => boolean;

	new (...params: any): any;
}

export class Item<Key extends object, Properties extends object> {
	protected _initial: Properties;
	protected _current: Properties;
	protected _SelfItem: SelfItem<Key, Properties>;

	constructor(props: Properties, SelfItem: SelfItem<Key, Properties>) {
		this._initial = props;
		this._current = props;
		this._SelfItem = SelfItem;
	}

	public get key() {
		const keyEntries = Object.keys(this._SelfItem.keyGen).map(key => [
			key as keyof Key,
			this._SelfItem.keyGen[key as keyof Key](this._current)[key as keyof Key]
		]);

		return Object.fromEntries(keyEntries) as Record<keyof Key, string>;
	}

	public get keys() {
		return this.key;
	}

	public get data() {
		return this._current;
	}

	public get init() {
		return this._initial;
	}

	public onValidate = async () => {};
	public onSet = async () => {};
	public onWrite = async () => {};
	public onCreate = async () => {};
	public onDelete = async () => {};

	public set = async (data: Partial<Properties>) => {
		await this.onSet();

		this._current = { ...this._current, ...data };

		if (this._SelfItem.logger) this._SelfItem.logger.info(this._current);

		return;
	};

	public validate = async () => {
		await this.onValidate();

		const result = this._SelfItem.validator(this._current);

		if (!result) throw new Error('Validation failed');

		return result;
	};

	public write = async () => {
		await this.onWrite();

		await this.validate();

		await this._SelfItem.db.put({
			Item: { ...this._current, ...this.keys }
		});

		return this;
	};

	public create = async () => {
		await this.onWrite();
		await this.onCreate();

		await this.validate();

		await this._SelfItem.db.create(this.key, {
			Item: { ...this._current, ...this.keys }
		});

		return this;
	};

	public update = async (data: Partial<Properties>) => {
		await this.set(data);
		await this.validate();

		let untrimmedUpdateExpression = 'SET ';
		let ExpressionAttributeValues = {};

		for (const key of Object.keys(data)) {
			untrimmedUpdateExpression += `${key} = :${key}, `;
			ExpressionAttributeValues = {
				...ExpressionAttributeValues,
				[`:${key}`]: lodashGet(data, key)
			};
		}

		const UpdateExpression = untrimmedUpdateExpression.slice(0, untrimmedUpdateExpression.length - 2);

		await this._SelfItem.db.update<Properties>({
			Key: this.key,
			UpdateExpression,
			ExpressionAttributeValues
		});

		return this;
	};

	public delete = async () => {
		await this.onDelete();

		await this._SelfItem.db.delete({
			Key: this.key
		});

		return;
	};
}
