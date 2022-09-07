import AJV, { JSONSchemaType } from 'ajv';
import AWS from 'aws-sdk';
import { nanoid } from 'nanoid';
import { Database } from './Database';
import { Item, OptionalProperties } from './Item';

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
	pk: string | number;
	sk: string | number;
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

	static keyGen = {
		pk: () => ({ pk: 'TestItem' }),
		sk: (props: Pick<ITestItem, 'testAttribute'>) => ({ sk: props.testAttribute })
	};

	static validator = ajv.compile<ITestItem>(schema);

	constructor({ testAttribute = nanoid() }: OptionalProperties<ITestItem, 'testAttribute'>) {
		super({ testAttribute }, TestItem);
	}
}

it('validates item', async () => {
	const testData = new TestItem({ testAttribute: nanoid() });

	const result = await testData.validate();

	expect(result).toBe(true);
});

it('throws on invalid item', async () => {
	expect.assertions(1);

	const testData = new TestItem({ testAttribute: 123 as unknown as string });

	await testData.validate().catch(err => expect(err).toBeDefined());
});

it('new item via defaults', async () => {
	expect.assertions(1);

	const testData = new TestItem({});

	const result = await testData.validate();

	expect(result).toBe(true);
});

it('creates item', async () => {
	const testData = await new TestItem({ testAttribute: nanoid() }).create();

	const getData = await db.get<ITestItem>({
		Key: testData.key
	});

	expect(getData).toStrictEqual({ ...testData.key, ...testData.data });
	expect(getData.testAttribute).toBe(testData.data.testAttribute);
});

it('writes data to item', async () => {
	const testData = new TestItem({ testAttribute: nanoid() });

	await documentClient
		.put({
			TableName: 'test',
			Item: { ...testData.key, ...testData.data }
		})
		.promise();

	testData.set({
		testAttribute: 'updated'
	});

	await testData.write();

	const getData = await db.get<typeof testData.data>({
		Key: testData.key
	});

	expect(getData.testAttribute).toBe('updated');
});

it('write fails if item doesnt exist', async () => {
	await new TestItem({ testAttribute: nanoid() }).write().catch(err => expect(err).toBeDefined());
});

it('updates data on item and database', async () => {
	const testData = new TestItem({ testAttribute: nanoid() });

	await testData.update({
		testAttribute: 'test'
	});

	expect(testData.data.testAttribute).toBe('test');

	const getData = await db.get<typeof testData.data>({
		Key: testData.key
	});

	expect(getData.testAttribute).toBe('test');
});

it('refreshes changed database data', async () => {
	const testData = new TestItem({ testAttribute: nanoid() });

	await documentClient
		.update({
			TableName: 'test',
			Key: testData.key,
			UpdateExpression: 'SET testAttribute = :testAttribute',
			ExpressionAttributeValues: {
				':testAttribute': 'changed'
			}
		})
		.promise();

	await testData.refresh();

	expect(testData.data.testAttribute).toBe('changed');
});

it('deletes item', async () => {
	const testData = new TestItem({ testAttribute: nanoid() });

	await documentClient
		.put({
			TableName: 'test',
			Item: { ...testData.key, ...testData.data }
		})
		.promise();

	await testData.delete();

	await db
		.get({
			Key: testData.key
		})
		.catch(err => expect(err).toBeDefined());
});
