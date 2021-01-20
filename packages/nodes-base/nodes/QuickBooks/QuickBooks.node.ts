import {
	IExecuteFunctions,
} from 'n8n-core';

import {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

import {
	customerFields,
	customerOperations,
} from './CustomerDescription';

import {
	quickBooksApiRequest,
	quickBooksApiRequestAllItems,
} from './GenericFunctions';

import { isEmpty } from 'lodash';

export class QuickBooks implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'QuickBooks',
		name: 'quickbooks',
		icon: 'file:quickbooks.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Consume the QuickBooks API',
		defaults: {
			name: 'QuickBooks',
			color: '#2CA01C',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'quickBooksOAuth2Api',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				options: [
					{
						name: 'Customer',
						value: 'customer',
					},
				],
				default: 'customer',
				description: 'Resource to consume',
			},

			// customer
			...customerOperations,
			...customerFields,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		let responseData;
		const returnData: IDataObject[] = [];

		const { companyId } = this.getCredentials('quickBooksOAuth2Api') as IDataObject;

		for (let i = 0; i < items.length; i++) {

			if (resource === 'customer') {

				if (operation === 'create') {

					const endpoint = `/v3/company/${companyId}/customer`;

					const body = {
						DisplayName: this.getNodeParameter('displayName', i),
					} as IDataObject;

					const additionalFields = this.getNodeParameter('additionalFields', i) as IDataObject;
					Object.keys(additionalFields).forEach(key => body[key] = additionalFields[key]);

					responseData = await quickBooksApiRequest.call(this, 'POST', endpoint, {}, body);

				} else if (operation === 'get') {

					const customerId = this.getNodeParameter('customerId', i);
					const endpoint = `/v3/company/${companyId}/customer/${customerId}`;
					responseData = await quickBooksApiRequest.call(this, 'GET', endpoint, {}, {});

				} else if (operation === 'search') {

					const endpoint = `/v3/company/${companyId}/query`;
					const qs = {
						query: this.getNodeParameter('selectStatement', i),
					} as IDataObject;

					const returnAll = this.getNodeParameter('returnAll', i);

					if (returnAll) {
						responseData = await quickBooksApiRequestAllItems.call(this, 'GET', endpoint, qs, {});
					} else {
						const limit = this.getNodeParameter('limit', i) as number;
						responseData = await quickBooksApiRequestAllItems.call(this, 'GET', endpoint, qs, {}, limit);
						responseData = responseData.splice(0, limit);
					}

				} else if (operation === 'update') {

					const customerId = this.getNodeParameter('customerId', i);
					const getEndpoint = `/v3/company/${companyId}/customer/${customerId}`;
					const { Customer: { SyncToken } } = await quickBooksApiRequest.call(this, 'GET', getEndpoint, {}, {});

					const updateEndpoint = `/v3/company/${companyId}/customer`;
					const body = {
						Id: this.getNodeParameter('customerId', i),
						SyncToken,
						sparse: true,
					} as IDataObject;

					const updateFields = this.getNodeParameter('updateFields', i) as IDataObject;

					if (isEmpty(updateFields)) {
						throw new Error('Please enter at least one field to update for the customer.');
					}

					Object.keys(updateFields).forEach(key => {
						if (key === 'PrimaryEmailAddr') {
							body[key] = {
								Address: updateFields[key],
							};
						} else if (key.startsWith('bill')) {
							const parsedKey = key.replace('bill', '');
							body.BillAddr = {
								[parsedKey]: updateFields[key],
							};
						} else {
							body[key] = updateFields[key];
						}
					});

					responseData = await quickBooksApiRequest.call(this, 'POST', updateEndpoint, {}, body);

				}

			}

			Array.isArray(responseData)
				? returnData.push(...responseData)
				: returnData.push(responseData);
			}

		return [this.helpers.returnJsonArray(returnData)];
	}
}