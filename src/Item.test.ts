import AWS from 'aws-sdk';
import { nanoid } from 'nanoid';
import { Database } from './Database';
import { Item, OptionalProperties } from './Item';

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

class TestItem extends Item<IKey, ITestItem> {
	static db = db;

	static key = {
		pk: () => ({ pk: 'TestItem' }),
		sk: (props: Pick<ITestItem, 'testAttribute'>) => ({ sk: props.testAttribute })
	};

	constructor({ testAttribute = nanoid() }: OptionalProperties<ITestItem, 'testAttribute'>) {
		super({ testAttribute }, TestItem);
	}
}

it('new item via defaults', async () => {
	expect.assertions(1);

	const testItem = new TestItem({});

	expect(testItem.props.testAttribute).toBeDefined();
});

it('creates item', async () => {
	const testItem = await new TestItem({ testAttribute: nanoid() }).create();

	const getTestItem = await db.get<ITestItem>({
		Key: testItem.key
	});

	expect(getTestItem).toStrictEqual({ ...testItem.key, ...testItem.props });
	expect(getTestItem.testAttribute).toBe(testItem.props.testAttribute);
});

it('writes new props to database', async () => {
	const testItem = new TestItem({ testAttribute: nanoid() });

	await documentClient
		.put({
			TableName: 'test',
			Item: { ...testItem.key, ...testItem.props }
		})
		.promise();

	testItem.set({
		testAttribute: 'updated'
	});

	await testItem.write();

	const getTestItem = await db.get<typeof testItem.props>({
		Key: testItem.key
	});

	expect(getTestItem.testAttribute).toBe('updated');
});

it('write fails if item doesnt exist', async () => {
	await new TestItem({ testAttribute: nanoid() }).write().catch(err => expect(err).toBeDefined());
});

it('updates props on item and database', async () => {
	const testItem = new TestItem({ testAttribute: nanoid() });

	await testItem.update({
		testAttribute: 'test'
	});

	expect(testItem.props.testAttribute).toBe('test');

	const getTestItem = await db.get<typeof testItem.props>({
		Key: testItem.key
	});

	expect(getTestItem.testAttribute).toBe('test');
});

it('deletes item', async () => {
	const testItem = new TestItem({ testAttribute: nanoid() });

	await documentClient
		.put({
			TableName: 'test',
			Item: { ...testItem.key, ...testItem.props }
		})
		.promise();

	await testItem.delete();

	await db
		.get({
			Key: testItem.key
		})
		.catch(err => expect(err).toBeDefined());
});
