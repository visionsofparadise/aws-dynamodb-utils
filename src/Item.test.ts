import AJV, { JSONSchemaType } from 'ajv';
import AWS from 'aws-sdk';
import { nanoid } from 'nanoid';
import { Database } from './Database';
import { Item } from './Item';

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

interface ITestItem {
	pk: string;
	sk: string;
	testAttribute: string;
}

const schema: JSONSchemaType<ITestItem> = {
	type: 'object',
	properties: {
		pk: { type: 'string' },
		sk: { type: 'string' },
		testAttribute: { type: 'string' }
	},
	required: ['pk', 'sk', 'testAttribute'],
	additionalProperties: false
} as any;

const validator = ajv.compile<ITestItem>(schema);

class TestItem extends Item<ITestItem, 'pk' | 'sk'> {
	constructor(props: Pick<ITestItem, 'testAttribute'>) {
		super(
			{
				pk: nanoid(),
				sk: nanoid(),
				...props
			},
			{
				keys: ['pk', 'sk'],
				db,
				validator
			}
		);
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

it('creates item', async () => {
	const testData = await new TestItem({ testAttribute: nanoid() }).create();

	const getData = await db.get<ITestItem>({
		Key: testData.key
	});

	expect(getData).toStrictEqual(testData.data);
	expect(getData.testAttribute).toBe(testData.data.testAttribute);
});

it('saves data to item', async () => {
	const testData = new TestItem({ testAttribute: nanoid() });

	await documentClient
		.put({
			TableName: 'test',
			Item: testData.data
		})
		.promise();

	testData.set({
		testAttribute: 'updated'
	});

	await testData.save();

	const getData = await db.get<typeof testData.data>({
		Key: testData.key
	});

	expect(getData.testAttribute).toBe('updated');
});

it('save fails if item doesnt exist', async () => {
	await new TestItem({ testAttribute: nanoid() }).save().catch(err => expect(err).toBeDefined());
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
			Item: testData.data
		})
		.promise();

	await testData.delete();

	await db
		.get({
			Key: testData.key
		})
		.catch(err => expect(err).toBeDefined());
});
