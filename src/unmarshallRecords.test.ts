import { DynamoDBRecord } from 'aws-lambda/trigger/dynamodb-stream';
import { Converter } from 'aws-sdk/clients/dynamodb';
import { nanoid } from 'nanoid';
import { unmarshallRecords } from './unmarshallRecords';

it('Unmarshalls records', () => {
	const testData = {
		pk: nanoid(),
		sk: nanoid(),
		testAttribute: 'test'
	};

	const marshalledItem = Converter.marshall(testData) as any;

	const records: Array<DynamoDBRecord> = [
		{
			eventName: 'REMOVE',
			dynamodb: {
				NewImage: marshalledItem,
				OldImage: marshalledItem
			}
		}
	];

	const result = unmarshallRecords(records, Converter);

	expect(result[0].oldRecord).toStrictEqual(testData);
	expect(result[0].newRecord).toStrictEqual(testData);
});
