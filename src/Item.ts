import { get } from 'lodash';
import { Database } from './Database';
import { ILogger } from './ILogger';

export type RequiredProperties<Data extends object, Properties extends keyof Data> = Pick<Data, Properties> &
	Partial<Omit<Data, Properties>>;
export type OptionalProperties<Data extends object, Properties extends keyof Data> = Omit<Data, Properties> &
	Partial<Pick<Data, Properties>>;
export interface SelfItem<Key extends object> {
	db: Database;
	logger?: ILogger;

	keyGen: {
		[x in keyof Key]: (props: any) => Record<x, string>;
	};

	new (...params: any): any;
}

export class Item<Key extends object, Properties extends object> {
	protected readonly _initial: Properties;
	protected _current: Properties;
	public readonly Item: SelfItem<Key>;

	constructor(props: Properties, Item: SelfItem<Key>) {
		this._initial = props;
		this._current = props;
		this.Item = Item;

		this.onNew();
	}

	public get key() {
		const keyEntries = Object.keys(this.Item.keyGen).map(key => [
			key as keyof Key,
			this.Item.keyGen[key as keyof Key](this._current)[key as keyof Key]
		]);

		return Object.fromEntries(keyEntries) as Record<keyof Key, string>;
	}

	public get keys() {
		return this.key;
	}

	public get props() {
		return this._current;
	}

	public get init() {
		return this._initial;
	}

	protected readonly onNew = () => {};
	protected readonly onSet = async () => {};
	protected readonly onWrite = async () => {};
	protected readonly onCreate = async () => {};
	protected readonly onDelete = async () => {};

	public readonly set = async (props: Partial<Properties>) => {
		await this.onSet();

		this._current = { ...this._current, ...props };

		if (this.Item.logger) this.Item.logger.info(this._current);

		return;
	};

	public readonly write = async () => {
		await this.onWrite();

		await this.Item.db.put({
			Item: { ...this._current, ...this.keys }
		});

		return this;
	};

	public readonly create = async () => {
		await this.onWrite();
		await this.onCreate();

		await this.Item.db.create(this.key, {
			Item: { ...this._current, ...this.keys }
		});

		return this;
	};

	public readonly update = async (props: Partial<Properties>) => {
		await this.set(props);

		let untrimmedUpdateExpression = 'SET ';
		let ExpressionAttributeValues = {};

		for (const key of Object.keys(props)) {
			untrimmedUpdateExpression += `${key} = :${key}, `;
			ExpressionAttributeValues = {
				...ExpressionAttributeValues,
				[`:${key}`]: get(props, key)
			};
		}

		const UpdateExpression = untrimmedUpdateExpression.slice(0, untrimmedUpdateExpression.length - 2);

		await this.Item.db.update<Properties>({
			Key: this.key,
			UpdateExpression,
			ExpressionAttributeValues
		});

		return this;
	};

	public readonly delete = async () => {
		await this.onDelete();

		await this.Item.db.delete({
			Key: this.key
		});

		return;
	};
}
