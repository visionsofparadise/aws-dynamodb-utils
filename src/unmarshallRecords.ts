import { DynamoDBRecord } from 'aws-lambda/trigger/dynamodb-stream';
import { Converter } from 'aws-sdk/clients/dynamodb';

export type IRecords<OldItem, NewItem> = Array<IRecord<OldItem, NewItem>>;

export interface IRecord<OldItem, NewItem> {
	newRecord: NewItem;
	oldRecord: OldItem;
}

export const unmarshallRecords = <OldItem extends object | undefined, NewItem extends object | undefined>(
	records: Array<DynamoDBRecord>,
	converter: typeof Converter
): IRecords<OldItem, NewItem> =>
	records.map(r => {
		if (!r.dynamodb) throw new Error('Invalid record');

		const newRecord = r.dynamodb.NewImage && converter.unmarshall(r.dynamodb.NewImage);
		const oldRecord = r.dynamodb.OldImage && converter.unmarshall(r.dynamodb.OldImage);

		const record = { newRecord, oldRecord };

		return record;
	}) as IRecords<OldItem, NewItem>;
