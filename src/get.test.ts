import AJV, { JSONSchemaType } from 'ajv';
import AWS from 'aws-sdk';
import { nanoid } from 'nanoid';
import { Database } from './Database';
import { Item, OptionalProperties } from './Item';
import { get } from './get';

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

class TestItem extends Item<IKey, ITestItem> {
	static db = db;

	static key = {
		pk: () => ({ pk: 'TestItem' }),
		sk: (props: Pick<ITestItem, 'testAttribute'>) => ({ sk: props.testAttribute })
	};

	static validator = ajv.compile(schema);

	public static get = get(TestItem, TestItem.key.pk, TestItem.key.sk);

	constructor({ testAttribute = nanoid() }: OptionalProperties<ITestItem, 'testAttribute'>) {
		super({ testAttribute }, TestItem);
	}
}

it('generates key for item', () => {
	const testItem = new TestItem({ testAttribute: nanoid() });

	const key = TestItem.get.keyOf(testItem.props);

	expect(key).toStrictEqual({ pk: 'TestItem', sk: testItem.props.testAttribute });
});

it('gets item', async () => {
	const testItem = await new TestItem({ testAttribute: nanoid() }).create();

	const getTestItem = await TestItem.get(testItem.props);

	expect(getTestItem.props.testAttribute).toBe(testItem.props.testAttribute);
});

it('lists items', async () => {
	const testItems: Array<TestItem> = [];

	for (let i = 0; i < 10; i++) {
		const testItem = await new TestItem({}).create();

		testItems.push(testItem);
	}

	const testItemIds = testItems.map(testItem => testItem.props.testAttribute);

	const getTestItems = await TestItem.get.some({});

	for (const testItem of getTestItems) {
		expect(testItemIds.includes(testItem.props.testAttribute));
	}
});

it('lists range of items', async () => {
	expect.assertions(1);

	for (let i = 0; i < 10; i++) {
		await new TestItem({ testAttribute: `000${i}-${nanoid()}` }).create();
	}

	const testItems = await TestItem.get.allRange({ min: { testAttribute: '0002' }, max: { testAttribute: '0007' } });

	expect(testItems.length).toBe(5);
});

it('lists all items', async () => {
	expect.assertions(1);

	for (let i = 0; i < 100; i++) {
		await new TestItem({}).create();
	}

	const testItems = await TestItem.get.all({ limit: 10 });

	expect(testItems.length).toBeGreaterThan(10);
});
