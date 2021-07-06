import { DynamoDBRecord } from 'aws-lambda/trigger/dynamodb-stream';
import { eventNameFilter } from './eventNameFilter';

it('filters by event name', () => {
	const records: Array<DynamoDBRecord> = [
		{
			eventName: 'REMOVE',
			dynamodb: {}
		},
		{
			eventName: 'INSERT',
			dynamodb: {}
		},
		{
			eventName: 'INSERT',
			dynamodb: {}
		}
	];

	const result = records.filter(eventNameFilter('REMOVE'));

	expect(result.length).toBe(1);
});
