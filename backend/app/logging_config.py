"""
Logging configuration for the application.
Configures logging to display extra fields in a human-readable format.
"""
import logging
import sys


class ExtraFieldsFormatter(logging.Formatter):
    """Formatter that appends extra fields to log messages."""
    
    STANDARD_FIELDS = {
        'name', 'msg', 'args', 'created', 'filename', 'funcName', 
        'levelname', 'levelno', 'lineno', 'module', 'msecs', 
        'pathname', 'process', 'processName', 'relativeCreated', 
        'stack_info', 'exc_info', 'exc_text', 'thread', 'threadName',
        'message', 'asctime', 'taskName'
    }
    
    def format(self, record):
        base_message = super().format(record)
        
        extra_fields = {
            k: v for k, v in record.__dict__.items() 
            if k not in self.STANDARD_FIELDS
        }
        
        if extra_fields:
            # Format extra fields as key=value pairs
            extra_str = ' | ' + ' '.join(f'{k}={v}' for k, v in sorted(extra_fields.items()))
            return base_message + extra_str
        
        return base_message


def configure_logging():
    """Configure logging with extra fields support."""
    formatter = ExtraFieldsFormatter(
        fmt='[%(levelname)s] %(asctime)s - %(message)s',
        datefmt='%H:%M:%S'
    )
    
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    
    # Clear existing handlers and add ours
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    
    # Set specific loggers to appropriate levels
    logging.getLogger('werkzeug').setLevel(logging.WARNING)  # Reduce Flask request logs
    logging.getLogger('urllib3').setLevel(logging.WARNING)  # Reduce HTTP library logs

