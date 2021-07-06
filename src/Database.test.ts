import AWS from 'aws-sdk';
import pick from 'lodash/pick';
import { nanoid } from 'nanoid';
import { Database } from './Database';

const documentClient = new AWS.DynamoDB.DocumentClient({
	endpoint: 'localhost:8000',
	sslEnabled: false,
	region: 'local-env'
});

const db = new Database({
	documentClient,
	tableName: 'test'
});

const testData = () => ({
	pk: nanoid(),
	sk: nanoid(),
	testAttribute: 'test'
});

const keys = ['pk', 'sk'];

it('gets item', async () => {
	const input = testData();

	await documentClient
		.put({
			TableName: 'test',
			Item: input
		})
		.promise();

	const Item = await db.get<typeof input>({
		Key: pick(input, keys)
	});

	expect(Item).toStrictEqual(input);
});

it('throws on item not found', async () => {
	expect.assertions(1);
	const input = testData();

	await db
		.get<typeof input>({
			Key: pick(input, keys)
		})
		.catch(err => expect(err).toBeDefined());
});

it('creates item', async () => {
	const input = testData();

	await db.create(pick(input, keys), {
		Item: input
	});

	const { Item } = (await documentClient
		.get({
			TableName: 'test',
			Key: pick(input, keys)
		})
		.promise()) as unknown as { Item: typeof input };

	expect(Item).toStrictEqual(input);
});

it('throws if item exists on create', async () => {
	const input = testData();

	await db.create(pick(input, keys), {
		Item: input
	});

	await db
		.create(pick(input, keys), {
			Item: input
		})
		.catch(error => expect(error).toBeDefined());
});

it('updates an attribute on an item', async () => {
	const input = testData();

	await documentClient
		.put({
			TableName: 'test',
			Item: input
		})
		.promise();

	await db.update<typeof input>({
		Key: pick(input, keys),
		UpdateExpression: 'SET testAttribute = :testAttribute',
		ExpressionAttributeValues: {
			':testAttribute': 'updated'
		}
	});

	const { Item } = (await documentClient
		.get({
			TableName: 'test',
			Key: pick(input, keys)
		})
		.promise()) as unknown as { Item: typeof input };

	expect(Item.testAttribute).toBe('updated');
});

it('updates attributes on an item', async () => {
	const input = {
		...testData(),
		testAttribute2: 'test'
	};

	await documentClient
		.put({
			TableName: 'test',
			Item: input
		})
		.promise();

	await db.update<typeof input>({
		Key: pick(input, keys),
		UpdateExpression: 'SET testAttribute = :testAttribute, testAttribute2 = :testAttribute2',
		ExpressionAttributeValues: {
			':testAttribute': 'updated',
			':testAttribute2': 'updated'
		}
	});

	const { Item } = (await documentClient
		.get({
			TableName: 'test',
			Key: pick(input, keys)
		})
		.promise()) as unknown as { Item: typeof input };

	expect(Item.testAttribute).toBe('updated');
	expect(Item.testAttribute2).toBe('updated');
});

it('removes attributes off an item', async () => {
	const input = {
		...testData(),
		testAttribute2: 'test'
	};

	await documentClient
		.put({
			TableName: 'test',
			Item: input
		})
		.promise();

	await db.update<typeof input>({
		Key: pick(input, keys),
		UpdateExpression: 'REMOVE testAttribute, testAttribute2'
	});

	const { Item } = (await documentClient
		.get({
			TableName: 'test',
			Key: pick(input, keys)
		})
		.promise()) as unknown as { Item: typeof input };

	expect(Item.testAttribute).not.toBeDefined();
	expect(Item.testAttribute2).not.toBeDefined();
});

it('queries items', async () => {
	const input = testData();

	await documentClient
		.put({
			TableName: 'test',
			Item: input
		})
		.promise();

	const { Items } = await db.query<typeof input>({
		KeyConditionExpression: 'pk = :pk',
		ExpressionAttributeValues: {
			':pk': input.pk
		}
	});

	expect(Items!.length).toBe(1);
});

it('queries from gsi', async () => {
	const input = {
		...testData(),
		gsiPk: 'test',
		gsiSk: 'test'
	};

	await documentClient
		.put({
			TableName: 'test',
			Item: input
		})
		.promise();

	const { Items } = await db.query<typeof input>({
		IndexName: 'GSI',
		KeyConditionExpression: 'gsiPk = :gsiPk',
		ExpressionAttributeValues: {
			':gsiPk': input.gsiPk
		}
	});

	expect(Items!.length).toBe(1);
});

it('scans items', async () => {
	const input = testData();

	await documentClient
		.put({
			TableName: 'test',
			Item: input
		})
		.promise();

	const { Items } = await db.scan();

	expect(Items!.length).toBeGreaterThan(0);
});

it('deletes item', async () => {
	const input = testData();

	await documentClient
		.put({
			TableName: 'test',
			Item: input
		})
		.promise();

	await db.delete({
		Key: pick(input, keys)
	});

	await documentClient
		.get({
			TableName: 'test',
			Key: pick(input, keys)
		})
		.promise()
		.catch(err => expect(err).toBeDefined());
});

it('throws on delete item not found', async () => {
	const input = testData();

	await db
		.delete({
			Key: pick(input, keys)
		})
		.catch(err => expect(err).toBeDefined());
});

it('resets and deletes all non system data', async () => {
	const scan1 = await db.scan();

	expect(scan1.Items!.length).toBeGreaterThan(0);

	await db.reset(keys);

	const scan2 = await db.scan();

	expect(scan2.Items!.length).toBe(0);
});

it('resets and does not delete system data', async () => {
	const input = testData();

	await documentClient
		.put({
			TableName: 'test',
			Item: {
				...input,
				isSystemItem: true
			}
		})
		.promise();

	await db.reset(keys, 'isSystemItem');

	const { Items } = await db.scan();

	expect(Items!.length).toBeGreaterThan(0);
});
