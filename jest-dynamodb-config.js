module.exports = {
	tables: [
		{
			TableName: `test`,
			KeySchema: [
				{ AttributeName: 'pk', KeyType: 'HASH' },
				{ AttributeName: 'sk', KeyType: 'RANGE' }
			],
			AttributeDefinitions: [
				{ AttributeName: 'pk', AttributeType: 'S' },
				{ AttributeName: 'sk', AttributeType: 'S' },
				{ AttributeName: 'gsiPk', AttributeType: 'S' },
				{ AttributeName: 'gsiSk', AttributeType: 'S' }
			],
			ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
			GlobalSecondaryIndexes: [
				{
					IndexName: 'GSI',
					KeySchema: [
						{ AttributeName: 'gsiPk', KeyType: 'HASH' },
						{ AttributeName: 'gsiSk', KeyType: 'RANGE' }
					],
					Projection: {
						ProjectionType: 'ALL'
					},
					ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 }
				}
			]
		}
	]
};
