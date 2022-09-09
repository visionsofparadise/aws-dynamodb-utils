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

export interface ItemListRangeQuery<SKProperties> {
	min: SKProperties;
	max: SKProperties;
}

export type ItemList<Item> = Array<Item> & {
	cursor?: Key;
};

export const get = <
	Item extends GetItem,
	PKFunctionProperties,
	SKFunctionProperties,
	PK extends { [x: string]: string },
	SK extends { [x: string]: string }
>(
	Item: Item,
	pkFunction: (params: PKFunctionProperties) => PK,
	skFunction: (params: SKFunctionProperties) => SK,
	index?: string
) => {
	const keyOf = (params: NonNullable<PKFunctionProperties & SKFunctionProperties>) => ({
		...pkFunction(params),
		...skFunction(params)
	});

	const one = (params: NonNullable<PKFunctionProperties & SKFunctionProperties>): Promise<InstanceType<Item>> => {
		const keyObject = keyOf(params);

		const [pk, sk] = Object.keys(keyObject);

		return !index
			? Item.db.get({ Key: keyObject }).then(data => new Item(data))
			: Item.db
					.query({
						IndexName: index,
						Limit: 1,
						KeyConditionExpression: `${pk} = :${pk} AND ${sk} = :${sk}`,
						ExpressionAttributeValues: {
							[`:${pk}`]: keyObject[pk],
							[`:${sk}`]: keyObject[sk]
						}
					})
					.then(data => {
						if (!data.Items || data.Items.length === 0) throw new Error('Not Found');

						const items: Array<InstanceType<Item>> = data.Items!.map(itemData => new Item(itemData));

						return items[0];
					});
	};

	const pkMaker = (query: PKFunctionProperties) => {
		const pkObject = pkFunction(query);
		const [[pk, pkValue]] = Object.entries(pkObject);

		return {
			pk,
			pkValue
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
		query: ItemListQuery & PKFunctionProperties & ItemListRangeQuery<SKFunctionProperties>
	): Promise<ItemList<InstanceType<Item>>> => {
		const { pk, pkValue } = pkMaker(query);

		const skMinObject = skFunction(query.min);
		const skMaxObject = skFunction(query.max);
		const sk = Object.keys(skMinObject)[0];

		return Item.db
			.query({
				...listQueryParams(query),
				KeyConditionExpression: `${pk} = :${pk} AND ${sk} BETWEEN :min AND :max`,
				ExpressionAttributeValues: {
					[`:${pk}`]: pkValue,
					':min': skMinObject[sk],
					':max': skMaxObject[sk]
				}
			})
			.then(listMaker);
	};

	const somePrefix =
		<SKPrefixGenProperties>(skPrefixFn: (params: SKPrefixGenProperties) => any) =>
		async (
			query: ItemListQuery & PKFunctionProperties & SKPrefixGenProperties
		): Promise<ItemList<InstanceType<Item>>> => {
			const { pk, pkValue } = pkMaker(query);

			const skObject = skPrefixFn(query);
			const [[sk, skValue]] = Object.entries(skObject);

			return Item.db
				.query({
					...listQueryParams(query),
					KeyConditionExpression: `${pk} = :${pk} AND ${sk} = :${sk}`,
					ExpressionAttributeValues: {
						[`:${pk}`]: pkValue,
						[`:${sk}`]: skValue
					}
				})
				.then(listMaker);
		};

	const some = async (query: ItemListQuery & PKFunctionProperties): Promise<ItemList<InstanceType<Item>>> => {
		const { pk, pkValue } = pkMaker(query);

		return Item.db
			.query({
				...listQueryParams(query),
				KeyConditionExpression: `${pk} = :${pk}`,
				ExpressionAttributeValues: {
					[`:${pk}`]: pkValue
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

	const allPrefix = <SKPrefixGenProperties>(skPrefixFn: (params: SKPrefixGenProperties) => any) =>
		allCustom(somePrefix(skPrefixFn));

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
