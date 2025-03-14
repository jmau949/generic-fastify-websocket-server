// services/dynamodb.ts
import { DynamoDB } from "aws-sdk";
import config from "../config/config";

// Initialize DynamoDB client with configuration
const dynamoOptions: DynamoDB.ClientConfiguration = {
  region: config.aws.region,
};

// Use local endpoint for development if specified
if (config.aws.dynamodb.endpoint) {
  dynamoOptions.endpoint = config.aws.dynamodb.endpoint;
}

// Create DynamoDB client instance
const dynamoDB = new DynamoDB.DocumentClient(dynamoOptions);

/**
 * DynamoDB service for common database operations
 */
export default {
  /**
   * Get an item from DynamoDB by partition key
   * @param tableName - The DynamoDB table name
   * @param key - The key object (must include the partition key)
   * @returns The item or undefined if not found
   */
  async getItem(tableName: string, key: Record<string, any>) {
    const params = {
      TableName: tableName,
      Key: key,
    };

    const result = await dynamoDB.get(params).promise();
    return result.Item;
  },

  /**
   * Put an item into DynamoDB
   * @param tableName - The DynamoDB table name
   * @param item - The item to store
   * @returns The result of the put operation
   */
  async putItem(tableName: string, item: Record<string, any>) {
    const params = {
      TableName: tableName,
      Item: item,
    };

    return await dynamoDB.put(params).promise();
  },

  /**
   * Delete an item from DynamoDB
   * @param tableName - The DynamoDB table name
   * @param key - The key object (must include the partition key)
   * @returns The result of the delete operation
   */
  async deleteItem(tableName: string, key: Record<string, any>) {
    const params = {
      TableName: tableName,
      Key: key,
    };

    return await dynamoDB.delete(params).promise();
  },

  /**
   * Query items from DynamoDB
   * @param tableName - The DynamoDB table name
   * @param keyConditionExpression - The key condition expression
   * @param expressionAttributeValues - The expression attribute values
   * @param options - Additional query options
   * @returns The query results
   */
  async query(
    tableName: string,
    keyConditionExpression: string,
    expressionAttributeValues: Record<string, any>,
    options: Partial<DynamoDB.DocumentClient.QueryInput> = {}
  ) {
    const params: DynamoDB.DocumentClient.QueryInput = {
      TableName: tableName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ...options,
    };

    const result = await dynamoDB.query(params).promise();
    return result.Items;
  },

  /**
   * Update an item in DynamoDB
   * @param tableName - The DynamoDB table name
   * @param key - The key object (must include the partition key)
   * @param updateExpression - The update expression
   * @param expressionAttributeValues - The expression attribute values
   * @param options - Additional update options
   * @returns The result of the update operation
   */
  async updateItem(
    tableName: string,
    key: Record<string, any>,
    updateExpression: string,
    expressionAttributeValues: Record<string, any>,
    options: Partial<DynamoDB.DocumentClient.UpdateItemInput> = {}
  ) {
    const params: DynamoDB.DocumentClient.UpdateItemInput = {
      TableName: tableName,
      Key: key,
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
      ...options,
    };

    const result = await dynamoDB.update(params).promise();
    return result.Attributes;
  },
};
