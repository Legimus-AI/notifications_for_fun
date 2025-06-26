# File Cleanup Service

The File Cleanup Service automatically manages storage by removing files older than 12 hours from the `storage/` directory every 12 hours.

## Features

- **Automatic Cleanup**: Runs every 12 hours using a cron schedule (`0 */12 * * *`)
- **Configurable Age Threshold**: Default is 12 hours, but can be customized
- **Recursive Directory Cleanup**: Removes files and empty directories recursively
- **Statistics Tracking**: Tracks total files and directories deleted
- **Safe Operation**: Handles errors gracefully without crashing the application
- **API Management**: RESTful endpoints for monitoring and manual control

## Configuration

The service is configured with:

- **Storage Path**: `./storage` (relative to project root)
- **Max Age**: 12 hours
- **Schedule**: Every 12 hours (00:00 and 12:00 UTC)
- **Timezone**: UTC

## API Endpoints

### Public Endpoints

- `GET /api/file-cleanup/health` - Health check for the cleanup service

### Protected Endpoints (require JWT authentication)

- `GET /api/file-cleanup/status` - Get service status and configuration
- `GET /api/file-cleanup/config` - Get service configuration
- `POST /api/file-cleanup/trigger` - Manually trigger cleanup

## Usage Examples

### Check Service Health

```bash
curl http://localhost:3000/api/file-cleanup/health
```

### Get Service Status (requires authentication)

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     http://localhost:3000/api/file-cleanup/status
```

### Manually Trigger Cleanup (requires authentication)

```bash
curl -X POST \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     http://localhost:3000/api/file-cleanup/trigger
```

## Response Examples

### Health Check Response

```json
{
  "success": true,
  "message": "Cleanup service is healthy",
  "data": {
    "isRunning": true,
    "lastCleanupTime": "2024-01-15T12:00:00.000Z",
    "nextCleanupTime": "2024-01-16T00:00:00.000Z"
  }
}
```

### Status Response

```json
{
  "success": true,
  "data": {
    "status": {
      "isRunning": true,
      "nextCleanupTime": "2024-01-16T00:00:00.000Z",
      "lastCleanupTime": "2024-01-15T12:00:00.000Z",
      "totalFilesDeleted": 45,
      "totalDirectoriesDeleted": 3
    },
    "config": {
      "storagePath": "/path/to/project/storage",
      "maxAgeHours": 12,
      "schedule": "0 */12 * * *",
      "timezone": "UTC"
    }
  }
}
```

## File Cleanup Logic

1. **File Age Check**: Files are considered old if their creation time (`birthtime`) is older than the configured threshold
2. **Recursive Processing**: The service processes directories recursively
3. **Directory Cleanup**: Empty directories are removed if they are also older than the threshold
4. **Error Handling**: Individual file/directory errors don't stop the cleanup process
5. **Logging**: All cleanup operations are logged for monitoring

## Technical Implementation

### Service Architecture

- **FileCleanupService**: Main service class handling cleanup logic
- **Cron Scheduling**: Uses `node-cron` for reliable scheduling
- **Type Safety**: TypeScript interfaces for configuration and status
- **Error Resilience**: Graceful error handling and recovery

### Graceful Shutdown

The service properly shuts down when the application receives termination signals:

- Stops the cron job
- Completes any ongoing cleanup operation
- Releases resources

### Testing

Comprehensive test suite covering:

- Service initialization and configuration
- File cleanup functionality
- Directory cleanup
- Statistics tracking
- Error handling scenarios

## Monitoring

Monitor the cleanup service through:

1. **Application Logs**: Cleanup operations are logged with emojis for easy identification
2. **API Endpoints**: Use the health and status endpoints for monitoring
3. **Statistics**: Track total files/directories cleaned over time

## Troubleshooting

### Service Not Running

- Check if the service started properly in application logs
- Verify no errors during initialization
- Use the health endpoint to check status

### Files Not Being Cleaned

- Verify files are actually older than 12 hours
- Check file permissions and access rights
- Review cleanup logs for specific errors

### Performance Issues

- Monitor cleanup statistics for large volumes
- Consider adjusting the schedule frequency if needed
- Check disk I/O performance during cleanup operations
