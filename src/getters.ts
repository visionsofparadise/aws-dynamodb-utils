import { Key } from 'aws-sdk/clients/dynamodb';
import { Database } from './Database';

export type GetterItem = {
	db: Database;

	new (...params: any): any;
};

export type ItemListQuery<KeyProperties extends any> = KeyProperties & {
	sortOrder?: 'ASC' | 'DESC';
	limit?: number;
	cursor?: Key;
};

export interface ItemList<Item> {
	items: Array<Item>;
	cursor?: Key;
}

export const getters = <Item extends GetterItem>(Item: Item) => {
	const key =
		<
			PartitionKeyGenProperties,
			SortKeyGenProperties,
			PartitionKey extends { [x: string]: string },
			SortKey extends { [x: string]: string }
		>(
			partitionKeyGen: (params: PartitionKeyGenProperties) => PartitionKey,
			sortKeyGen: (params: SortKeyGenProperties) => SortKey
		) =>
		(params: NonNullable<PartitionKeyGenProperties & SortKeyGenProperties>) => ({
			...partitionKeyGen(params),
			...sortKeyGen(params)
		});

	const get =
		<KeyProperties>(keyGen: (params: KeyProperties) => any, index?: string) =>
		(params: KeyProperties): Promise<InstanceType<Item>> => {
			const key = keyGen(params);

			const [partitionKey, sortKey] = Object.keys(key);

			return !index
				? Item.db.get({ Key: key }).then(data => new Item(data))
				: Item.db
						.query({
							IndexName: index,
							Limit: 1,
							KeyConditionExpression: `${partitionKey} = :${partitionKey} AND ${sortKey} = :${sortKey}`,
							ExpressionAttributeValues: {
								[`:${partitionKey}`]: key[partitionKey],
								[`:${sortKey}`]: key[sortKey]
							}
						})
						.then(data => {
							if (!data.Items || data.Items.length === 0) throw new Error('Not Found');

							const items: Array<InstanceType<Item>> = data.Items!.map(itemData => new Item(itemData));

							return items[0];
						});
		};

	const list =
		<PartitionKeyGenProperties, SortKeyGenProperties>(
			partitionKeyGen: (params: PartitionKeyGenProperties) => any,
			sortKeyPrefixFn?: (params: SortKeyGenProperties) => any,
			index?: string
		) =>
		async (
			params: ItemListQuery<PartitionKeyGenProperties & SortKeyGenProperties>
		): Promise<ItemList<InstanceType<Item>>> => {
			const partitionKeyObject = partitionKeyGen(params);

			const partitionKey = Object.keys(partitionKeyObject)[0];

			let sortKeyObject;
			let sortKey: string | undefined;

			if (sortKeyPrefixFn) {
				sortKeyObject = sortKeyPrefixFn(params);
				sortKey = Object.keys(sortKeyObject)[0];
			}

			return Item.db
				.query({
					IndexName: index,
					Limit: (params.limit && params.limit > 1000 ? 1000 : params.limit) || 1000,
					ScanIndexForward: params.sortOrder === 'ASC',
					ExclusiveStartKey: params.cursor,
					KeyConditionExpression: `${partitionKey} = :${partitionKey}${
						sortKeyPrefixFn ? ` AND ${sortKey} = :${sortKey}` : ''
					}`,
					ExpressionAttributeValues:
						sortKeyPrefixFn && sortKeyObject && sortKey
							? {
									[`:${partitionKey}`]: partitionKeyObject[partitionKey],
									[`:${sortKey}`]: sortKeyObject[sortKey]
							  }
							: {
									[`:${partitionKey}`]: partitionKeyObject[partitionKey]
							  }
				})
				.then(data => ({
					items: data.Items!.map(itemData => new Item(itemData)),
					cursor: data.LastEvaluatedKey
				}));
		};

	const listAll =
		<PartitionKeyGenProperties, SortKeyGenProperties>(
			partitionKeyGen: (params: PartitionKeyGenProperties) => any,
			sortKeyPrefixFn?: (params: SortKeyGenProperties) => any,
			index?: string
		) =>
		async (
			params: ItemListQuery<PartitionKeyGenProperties & SortKeyGenProperties>
		): Promise<Omit<ItemList<InstanceType<Item>>, 'cursor'>> => {
			const listFunction = list(partitionKeyGen, sortKeyPrefixFn, index);

			const getPages = async (
				getPagesQuery: ItemListQuery<PartitionKeyGenProperties & SortKeyGenProperties>
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

	return {
		key,
		get,
		list,
		listAll
	};
};
