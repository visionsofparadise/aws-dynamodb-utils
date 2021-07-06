import { DynamoDBRecord } from 'aws-lambda/trigger/dynamodb-stream';

export const eventNameFilter =
	(eventName: string) =>
	(r: DynamoDBRecord): boolean =>
		r.eventName === eventName && r.dynamodb ? true : false;
