import { get as lodashGet, omit } from 'lodash';
import { Database } from './Database';
import { ILogger } from './ILogger';

export type RequiredProperties<Data extends object, Properties extends keyof Data> = Pick<Data, Properties> &
	Partial<Omit<Data, Properties>>;
export type OptionalProperties<Data extends object, Properties extends keyof Data> = Omit<Data, Properties> &
	Partial<Pick<Data, Properties>>;
export interface SelfItem<
	Key extends object,
	Properties extends object,
	ConstructorProperties extends object | undefined
> {
	db: Database;
	keyGen: {
		[x in keyof Key]: (props: any) => Record<x, string>;
	};
	defaults: (props: ConstructorProperties) => Properties;
	validator: (data: Properties) => boolean;
	logger?: ILogger;
}

export class Item<Key extends object, Properties extends object, ConstructorProperties extends object | undefined> {
	protected _initial: Properties;
	protected _current: Properties;
	protected _SelfItem: SelfItem<Key, Properties, ConstructorProperties>;

	constructor(props: ConstructorProperties, SelfItem: SelfItem<Key, Properties, ConstructorProperties>) {
		const defaults = SelfItem.defaults(props);

		this._initial = defaults;
		this._current = defaults;
		this._SelfItem = SelfItem;
	}

	public get data() {
		return this._current;
	}

	public get init() {
		return this._initial;
	}

	public get key() {
		const keyEntries = Object.keys(this._SelfItem.keyGen).map(key => [
			key as keyof Key,
			this._SelfItem.keyGen[key as keyof Key](this._current)[key as keyof Key]
		]);

		return Object.fromEntries(keyEntries) as Record<keyof Key, string>;
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
			Item: { ...this.key, ...this._current }
		});

		return this;
	};

	public create = async () => {
		await this.onWrite();
		await this.onCreate();

		await this.validate();

		await this._SelfItem.db.create(this.key, {
			Item: { ...this.key, ...this._current }
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

	public refresh = async () => {
		const newData = await this._SelfItem.db.get<Properties>({
			Key: this.key
		});

		const data = omit(newData, Object.keys(this._SelfItem.keyGen) as Array<keyof Key>);

		return this.set(data);
	};

	public delete = async () => {
		await this.onDelete();

		await this._SelfItem.db.delete({
			Key: this.key
		});

		return;
	};
}
