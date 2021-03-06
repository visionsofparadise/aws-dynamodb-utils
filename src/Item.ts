import pick from 'lodash/pick';
import { Database } from './Database';
import { ILogger } from './ILogger';

export type RequiredKeys<Data extends object, Keys extends keyof Data> = Pick<Data, Keys> & Partial<Omit<Data, Keys>>;
export type OptionalKeys<Data extends object, Keys extends keyof Data> = Omit<Data, Keys> & Partial<Pick<Data, Keys>>;

export class Item<Schema extends object> {
	protected _keys: Array<keyof Schema>;
	protected _validator: (Data: Schema) => boolean;
	protected _db: Database;
	protected _logger?: ILogger;
	protected _initial: Schema;
	protected _current: Schema;
	protected _onValidate: () => Promise<any> | any;
	protected _onSave: () => Promise<any> | any;
	protected _onCreate: () => Promise<any> | any;
	protected _onDelete: () => Promise<any> | any;

	constructor(
		props: Schema,
		config: {
			keys: Array<keyof Schema>;
			validator: (Data: Schema) => boolean;
			db: Database;
			logger?: ILogger;
			onValidate?: () => Promise<any> | any;
			onSave?: () => Promise<any> | any;
			onCreate?: () => Promise<any> | any;
			onDelete?: () => Promise<any> | any;
		}
	) {
		this._initial = props;
		this._current = props;

		this._keys = config.keys;
		this._validator = config.validator;
		this._db = config.db;
		this._logger = config.logger;
		this._onValidate = config.onValidate ? config.onValidate : () => null;
		this._onSave = config.onSave ? config.onSave : () => null;
		this._onCreate = config.onCreate ? config.onCreate : () => null;
		this._onDelete = config.onDelete ? config.onDelete : () => null;
	}

	public get data() {
		return this._current;
	}

	public set(data: Partial<Schema>) {
		this._current = { ...this._current, ...data };

		if (this._logger) this._logger.info(this._current);

		this.validate();

		return;
	}

	public get init() {
		return this._initial;
	}

	public get key() {
		return pick(this._current, this._keys);
	}

	public save = async () => {
		await this._onSave();

		await this.validate();

		await this._db.put({
			Item: this._current
		});

		return this;
	};

	public create = async () => {
		await this._onSave();
		await this._onCreate();

		await this.validate();

		await this._db.create(this.key, {
			Item: this._current
		});

		return this;
	};

	public delete = async () => {
		await this._onDelete();

		await this._db.delete({
			Key: this.key
		});

		return;
	};

	public validate = async () => {
		await this._onValidate();

		const result = this._validator(this._current);

		if (!result) throw new Error('Validation failed');

		return result;
	};
}
