import AJV, { JSONSchemaType } from 'ajv';
import AWS from 'aws-sdk';
import { nanoid } from 'nanoid';
import { Database } from './Database';
import { Item, OptionalProperties } from './Item';
import { getters } from './getters';

const ajv = new AJV();

const documentClient = new AWS.DynamoDB.DocumentClient({
	endpoint: 'localhost:8000',
	sslEnabled: false,
	region: 'local-env'
});

const db = new Database({
	documentClient,
	tableName: 'test',
	keys: ['pk', 'sk'],
	systemKey: 'isSystemItem'
});

interface IKey {
	pk: string;
	sk: string;
}

interface ITestItem {
	testAttribute: string;
}

const schema: JSONSchemaType<ITestItem> = {
	type: 'object',
	properties: {
		testAttribute: { type: 'string' }
	},
	required: ['testAttribute'],
	additionalProperties: false
} as any;

class TestItem extends Item<IKey, ITestItem, OptionalProperties<ITestItem, 'testAttribute'>> {
	static db = db;

	static keyGen = {
		pk: () => ({ pk: 'TestItem' }),
		sk: (props: Pick<ITestItem, 'testAttribute'>) => ({ sk: props.testAttribute })
	};

	static defaults = ({ testAttribute = nanoid() }) => ({ testAttribute });
	static validator = ajv.compile(schema);

	public static getters = getters(TestItem);

	static key = TestItem.getters.key(TestItem.keyGen.pk, TestItem.keyGen.sk);
	static get = TestItem.getters.get(TestItem.key);
	static list = TestItem.getters.list(TestItem.keyGen.pk);
	static listAll = TestItem.getters.listAll(TestItem.keyGen.pk);

	constructor(props: OptionalProperties<ITestItem, 'testAttribute'>) {
		super(props, TestItem);
	}
}

it('generates key for item', () => {
	const testItem = new TestItem({ testAttribute: nanoid() });

	const key = TestItem.key(testItem.data);

	expect(key).toStrictEqual({ pk: 'TestItem', sk: testItem.data.testAttribute });
});

it('gets item', async () => {
	const testItem = await new TestItem({ testAttribute: nanoid() }).create();

	const getTestItem = await TestItem.get(testItem.data);

	expect(getTestItem.data.testAttribute).toBe(testItem.data.testAttribute);
});

it('lists items', async () => {
	const testItems: Array<TestItem> = [];

	for (let i = 0; i < 10; i++) {
		const testItem = await new TestItem({}).create();

		testItems.push(testItem);
	}

	const testItemIds = testItems.map(testItem => testItem.data.testAttribute);

	const itemList = await TestItem.list({});

	for (const testItem of itemList.items) {
		expect(testItemIds.includes(testItem.data.testAttribute));
	}
});

it('lists all items', async () => {
	expect.assertions(1);

	for (let i = 0; i < 100; i++) {
		await new TestItem({}).create();
	}

	const itemList = await TestItem.listAll({ limit: 10 });

	expect(itemList.items.length).toBeGreaterThan(10);
});
