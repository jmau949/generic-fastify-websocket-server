// services/messageService.ts
import { v4 as uuidv4 } from "uuid";
import dynamoDB from "./dynamodb";
import config from "../config/config";

// Get table name from config
const messagesTable = config.aws.dynamodb.tableNames.messages;

interface Message {
  id: string;
  userId: string;
  content: string;
  timestamp: number;
  roomId?: string;
  metadata?: Record<string, any>;
}

/**
 * Message service for managing socket.io messages
 */
export default {
  /**
   * Save a message to DynamoDB
   * @param userId - The user ID who sent the message
   * @param content - The message content
   * @param roomId - Optional room ID for group messages
   * @param metadata - Optional additional metadata
   * @returns The saved message
   */
  async saveMessage(
    userId: string,
    content: string,
    roomId?: string,
    metadata?: Record<string, any>
  ): Promise<Message> {
    const message: Message = {
      id: uuidv4(),
      userId,
      content,
      timestamp: Date.now(),
      ...(roomId && { roomId }),
      ...(metadata && { metadata }),
    };

    await dynamoDB.putItem(messagesTable, message);
    return message;
  },

  /**
   * Get messages for a user
   * @param userId - The user ID
   * @param limit - Maximum number of messages to return
   * @returns The user's messages
   */
  async getUserMessages(userId: string, limit = 100): Promise<Message[]> {
    const messages = await dynamoDB.query(
      messagesTable,
      "userId = :userId",
      { ":userId": userId },
      {
        Limit: limit,
        ScanIndexForward: false, // Sort by newest first
      }
    );

    return messages as Message[];
  },

  /**
   * Get messages for a room
   * @param roomId - The room ID
   * @param limit - Maximum number of messages to return
   * @returns The room's messages
   */
  async getRoomMessages(roomId: string, limit = 100): Promise<Message[]> {
    // Assuming we have a global secondary index on roomId
    const messages = await dynamoDB.query(
      messagesTable,
      "roomId = :roomId",
      { ":roomId": roomId },
      {
        IndexName: "roomId-index",
        Limit: limit,
        ScanIndexForward: false, // Sort by newest first
      }
    );

    return messages as Message[];
  },

  /**
   * Delete a message
   * @param messageId - The message ID
   * @param userId - The user ID (for authorization)
   * @returns True if successful, false otherwise
   */
  async deleteMessage(messageId: string, userId: string): Promise<boolean> {
    // First verify the message belongs to the user
    const message = await dynamoDB.getItem(messagesTable, { id: messageId });

    if (!message || message.userId !== userId) {
      return false;
    }

    await dynamoDB.deleteItem(messagesTable, { id: messageId });
    return true;
  },
};
