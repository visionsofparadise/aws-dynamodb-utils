import { Key } from 'aws-sdk/clients/dynamodb';
import { Database, IItems } from './Database';

export type GetItem = {
	db: Database;

	new (...params: any): any;
};

export interface ItemListQuery {
	sortOrder?: 'ASC' | 'DESC';
	limit?: number;
	cursor?: Key;
}

export interface ItemListRangeQuery<SortKeyProperties> {
	min: SortKeyProperties;
	max: SortKeyProperties;
}

export type ItemList<Item> = Array<Item> & {
	cursor?: Key;
};

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

	const partitionKeyMaker = (query: PartitionKeyGenProperties) => {
		const partitionKeyObject = partitionKeyGen(query);
		const [[partitionKey, partitionKeyValue]] = Object.entries(partitionKeyObject);

		return {
			partitionKey,
			partitionKeyValue
		};
	};

	const listQueryParams = (query: ItemListQuery) => ({
		IndexName: index,
		Limit: (query.limit && query.limit > 1000 ? 1000 : query.limit) || 1000,
		ScanIndexForward: query.sortOrder === 'ASC',
		ExclusiveStartKey: query.cursor
	});

	const listMaker = <DatabaseItem extends object>(data: IItems<DatabaseItem>) => {
		let items: Array<InstanceType<Item>> = data.Items ? data.Items.map(itemData => new Item(itemData)) : [];

		return Object.assign(items, { cursor: data.LastEvaluatedKey });
	};

	const someRange = async (
		query: ItemListQuery & PartitionKeyGenProperties & ItemListRangeQuery<SortKeyGenProperties>
	): Promise<ItemList<InstanceType<Item>>> => {
		const { partitionKey, partitionKeyValue } = partitionKeyMaker(query);

		const sortKeyMinObject = sortKeyGen(query.min);
		const sortKeyMaxObject = sortKeyGen(query.max);
		const sortKey = Object.keys(sortKeyMinObject)[0];

		return Item.db
			.query({
				...listQueryParams(query),
				KeyConditionExpression: `${partitionKey} = :${partitionKey} AND ${sortKey} BETWEEN :min AND :max`,
				ExpressionAttributeValues: {
					[`:${partitionKey}`]: partitionKeyValue,
					':min': sortKeyMinObject[sortKey],
					':max': sortKeyMaxObject[sortKey]
				}
			})
			.then(listMaker);
	};

	const somePrefix =
		<SortKeyPrefixGenProperties>(sortKeyPrefixFn: (params: SortKeyPrefixGenProperties) => any) =>
		async (
			query: ItemListQuery & PartitionKeyGenProperties & SortKeyPrefixGenProperties
		): Promise<ItemList<InstanceType<Item>>> => {
			const { partitionKey, partitionKeyValue } = partitionKeyMaker(query);

			const sortKeyObject = sortKeyPrefixFn(query);
			const [[sortKey, sortKeyValue]] = Object.entries(sortKeyObject);

			return Item.db
				.query({
					...listQueryParams(query),
					KeyConditionExpression: `${partitionKey} = :${partitionKey} AND ${sortKey} = :${sortKey}`,
					ExpressionAttributeValues: {
						[`:${partitionKey}`]: partitionKeyValue,
						[`:${sortKey}`]: sortKeyValue
					}
				})
				.then(listMaker);
		};

	const some = async (query: ItemListQuery & PartitionKeyGenProperties): Promise<ItemList<InstanceType<Item>>> => {
		const { partitionKey, partitionKeyValue } = partitionKeyMaker(query);

		return Item.db
			.query({
				...listQueryParams(query),
				KeyConditionExpression: `${partitionKey} = :${partitionKey}`,
				ExpressionAttributeValues: {
					[`:${partitionKey}`]: partitionKeyValue
				}
			})
			.then(listMaker);
	};

	const allCustom =
		<ListFunctionProperties>(listFunction: (params: ListFunctionProperties) => Promise<ItemList<InstanceType<Item>>>) =>
		async (params: ListFunctionProperties): Promise<Omit<ItemList<InstanceType<Item>>, 'cursor'>> => {
			const getPages = async (getPagesQuery: ListFunctionProperties): Promise<Array<InstanceType<Item>>> => {
				const itemList = await listFunction(getPagesQuery);

				if (itemList.cursor) {
					const moreItems = await getPages({ ...getPagesQuery, cursor: itemList.cursor });

					return [...itemList, ...moreItems];
				} else {
					return itemList;
				}
			};

			const items = await getPages(params);

			return items;
		};

	const allRange = allCustom(someRange);

	const allPrefix = <SortKeyPrefixGenProperties>(sortKeyPrefixFn: (params: SortKeyPrefixGenProperties) => any) =>
		allCustom(somePrefix(sortKeyPrefixFn));

	const all = allCustom(some);

	return Object.assign(one, {
		keyOf,
		some,
		somePrefix,
		someRange,
		all,
		allPrefix,
		allRange
	});
};
