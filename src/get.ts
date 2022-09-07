import { Key } from 'aws-sdk/clients/dynamodb';
import { Database } from './Database';

export type GetItem = {
	db: Database;

	new (...params: any): any;
};

export interface ItemListQuery {
	sortOrder?: 'ASC' | 'DESC';
	limit?: number;
	cursor?: Key;
}

export interface ItemList<Item> {
	items: Array<Item>;
	cursor?: Key;
}

export const get = <
	Item extends GetItem,
	PartitionKeyGenProperties,
	SortKeyGenProperties,
	PartitionKey extends { [x: string]: string },
	SortKey extends { [x: string]: string }
>(
	Item: Item,
	partitionKeyGen: (params: PartitionKeyGenProperties) => PartitionKey,
	sortKeyGen: (params: SortKeyGenProperties) => SortKey,
	index?: string
) => {
	const keyOf = (params: NonNullable<PartitionKeyGenProperties & SortKeyGenProperties>) => ({
		...partitionKeyGen(params),
		...sortKeyGen(params)
	});

	const one = (params: NonNullable<PartitionKeyGenProperties & SortKeyGenProperties>): Promise<InstanceType<Item>> => {
		const keyObject = keyOf(params);

		const [partitionKey, sortKey] = Object.keys(keyObject);

		return !index
			? Item.db.get({ Key: keyObject }).then(data => new Item(data))
			: Item.db
					.query({
						IndexName: index,
						Limit: 1,
						KeyConditionExpression: `${partitionKey} = :${partitionKey} AND ${sortKey} = :${sortKey}`,
						ExpressionAttributeValues: {
							[`:${partitionKey}`]: keyObject[partitionKey],
							[`:${sortKey}`]: keyObject[sortKey]
						}
					})
					.then(data => {
						if (!data.Items || data.Items.length === 0) throw new Error('Not Found');

						const items: Array<InstanceType<Item>> = data.Items!.map(itemData => new Item(itemData));

						return items[0];
					});
	};

	const somePrefix =
		<SortKeyPrefixGenProperties>(sortKeyPrefixFn: (params: SortKeyPrefixGenProperties) => any) =>
		async (
			query: ItemListQuery & PartitionKeyGenProperties & SortKeyPrefixGenProperties
		): Promise<ItemList<InstanceType<Item>>> => {
			const partitionKeyObject = partitionKeyGen(query);
			const partitionKey = Object.keys(partitionKeyObject)[0];

			const sortKeyObject = sortKeyPrefixFn(query);
			const sortKey = Object.keys(sortKeyObject)[0];

			return Item.db
				.query({
					IndexName: index,
					Limit: (query.limit && query.limit > 1000 ? 1000 : query.limit) || 1000,
					ScanIndexForward: query.sortOrder === 'ASC',
					ExclusiveStartKey: query.cursor,
					KeyConditionExpression: `${partitionKey} = :${partitionKey} AND ${sortKey} = :${sortKey}`,
					ExpressionAttributeValues: {
						[`:${partitionKey}`]: partitionKeyObject[partitionKey],
						[`:${sortKey}`]: sortKeyObject[sortKey]
					}
				})
				.then(data => ({
					items: data.Items!.map(itemData => new Item(itemData)),
					cursor: data.LastEvaluatedKey
				}));
		};

	const some = async (query: ItemListQuery & PartitionKeyGenProperties): Promise<ItemList<InstanceType<Item>>> => {
		const partitionKeyObject = partitionKeyGen(query);
		const partitionKey = Object.keys(partitionKeyObject)[0];

		return Item.db
			.query({
				IndexName: index,
				Limit: (query.limit && query.limit > 1000 ? 1000 : query.limit) || 1000,
				ScanIndexForward: query.sortOrder === 'ASC',
				ExclusiveStartKey: query.cursor,
				KeyConditionExpression: `${partitionKey} = :${partitionKey}`,
				ExpressionAttributeValues: {
					[`:${partitionKey}`]: partitionKeyObject[partitionKey]
				}
			})
			.then(data => ({
				items: data.Items!.map(itemData => new Item(itemData)),
				cursor: data.LastEvaluatedKey
			}));
	};

	const allPrefix =
		<SortKeyPrefixGenProperties>(sortKeyPrefixFn?: (params: SortKeyPrefixGenProperties) => any) =>
		async (
			params: ItemListQuery & PartitionKeyGenProperties & SortKeyPrefixGenProperties
		): Promise<Omit<ItemList<InstanceType<Item>>, 'cursor'>> => {
			const listFunction = sortKeyPrefixFn ? somePrefix(sortKeyPrefixFn) : some;

			const getPages = async (
				getPagesQuery: ItemListQuery & PartitionKeyGenProperties & SortKeyPrefixGenProperties
			): Promise<Array<InstanceType<Item>>> => {
				const itemList = await listFunction(getPagesQuery);

				if (itemList.cursor) {
					const moreItems = await getPages({ ...getPagesQuery, cursor: itemList.cursor });

					return [...itemList.items, ...moreItems];
				} else {
					return itemList.items;
				}
			};

			const items = await getPages(params);

			return { items };
		};

	const all = allPrefix();

	return Object.assign(one, {
		keyOf,
		some,
		somePrefix,
		all,
		allPrefix
	});
};
