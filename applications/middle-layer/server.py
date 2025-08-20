import os
import asyncio
import tempfile
import shutil
import base64
import json
from typing import List, Dict, Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import logging

from agents import Agent, Runner, SQLiteSession
from agents.mcp.server import MCPServerStreamableHttp, MCPServerStreamableHttpParams
import uuid

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Pydantic models for structured output
class FileInfo(BaseModel):
    id: str
    filename: str
    created_at: str

class FilesListResponse(BaseModel):
    files: List[FileInfo]

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup - no global agents needed
    logger.info("Starting middle layer server...")
    yield
    # Shutdown
    logger.info("Shutting down...")

# Initialize FastAPI app
app = FastAPI(lifespan=lifespan)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request models
class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    conversation_history: List[Dict[str, str]] = []  # Deprecated, kept for compatibility

def load_system_prompt():
    """Load system prompt from file"""
    try:
        with open("system_prompt.txt", "r", encoding="utf-8") as f:
            return f.read().strip()
    except FileNotFoundError:
        logger.warning("system_prompt.txt not found, using default prompt")
        return "You are a helpful assistant with access to a knowledge base containing documents and images uploaded by the user."

async def create_agent():
    """Create the OpenAI agent with MCP server connection"""
    mcp_url = os.getenv('MCP_SERVER_URL', 'http://localhost:3000/mcp')
    params: MCPServerStreamableHttpParams = {
        "url": mcp_url,
        "terminate_on_close": True,
        "timeout": 120,  # Increased from 30 to 120 seconds for file uploads
        "sse_read_timeout": 120,  # Increased from 30 to 120 seconds
        "headers": {
            "Accept": "application/json, text/event-stream",
            "x-supabase-url": os.getenv('SUPABASE_URL'),
            "x-supabase-key": os.getenv('SUPABASE_SERVICE_KEY'),
            "x-openai-key": os.getenv('OPENAI_API_KEY')
        }
    }
    
    mcp_server = MCPServerStreamableHttp(
        params=params,
        client_session_timeout_seconds=120  # Increased from 30 to 120 seconds
    )
    
    # Load system prompt from file
    system_prompt = load_system_prompt()
    
    agent = Agent(
        name="Knowledge Base Assistant",
        instructions=system_prompt,
        model="gpt-4o-mini",
        mcp_servers=[mcp_server]
    )
    
    # Connect the MCP server
    await mcp_server.connect()
    logger.info("Connected to MCP server for agent")
    
    return agent, mcp_server

async def create_files_agent():
    """Create a specialized agent for files listing with structured output"""
    mcp_url = os.getenv('MCP_SERVER_URL', 'http://localhost:3000/mcp')
    params: MCPServerStreamableHttpParams = {
        "url": mcp_url,
        "terminate_on_close": True,
        "timeout": 120,  # Increased from 30 to 120 seconds
        "sse_read_timeout": 120,  # Increased from 30 to 120 seconds
        "headers": {
            "Accept": "application/json, text/event-stream",
            "x-supabase-url": os.getenv('SUPABASE_URL'),
            "x-supabase-key": os.getenv('SUPABASE_SERVICE_KEY'),
            "x-openai-key": os.getenv('OPENAI_API_KEY')
        }
    }
    mcp_server = MCPServerStreamableHttp(
        params=params,
        client_session_timeout_seconds=120  # Increased from 30 to 120 seconds
    )
    
    files_agent = Agent(
        name="Files List Agent",
        instructions="You are an agent that retrieves file listings. Use the get_files tool and return the results in the specified format.",
        model="gpt-4o-mini",
        mcp_servers=[mcp_server],
        output_type=FilesListResponse
    )
    
    # Connect the MCP server
    await mcp_server.connect()
    logger.info("Connected to MCP server for files agent")
    
    return files_agent, mcp_server

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "server": "running"
    }



@app.post("/api/chat")
async def chat(request: ChatRequest):
    """Chat endpoint with session support for conversation history"""
    logger.info(f"Received chat request: {request.message}, session_id: {request.session_id}")
    
    agent = None
    mcp_server = None
    session = None
    
    try:
        # Create a fresh agent and MCP connection for this request
        agent, mcp_server = await create_agent()
        
        # Create or use existing session with persistent database
        session_id = request.session_id or str(uuid.uuid4())
        session = SQLiteSession(session_id, "conversation_history.db")
        
        logger.info(f"Using session: {session_id}")
        
        # Run the agent with session
        result = await Runner.run(agent, request.message, session=session)
        
        return {
            "response": result.final_output,
            "status": "success",
            "session_id": session_id
        }
        
    except Exception as e:
        logger.error(f"Error in chat: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Always cleanup the MCP connection
        if mcp_server:
            try:
                await mcp_server.cleanup()
                logger.info("MCP server cleanup completed for chat request")
            except Exception as e:
                logger.warning(f"MCP server cleanup failed: {e}")

@app.get("/api/files")
async def get_files():
    """Get list of all files in the knowledge base"""
    logger.info("Received request to get files")
    
    files_agent = None
    mcp_server = None
    
    try:
        # Create a fresh files agent and MCP connection for this request
        files_agent, mcp_server = await create_files_agent()
        
        # Use the specialized files agent with structured output
        message = "Please use the get_files tool to retrieve all documents"
        result = await Runner.run(files_agent, message)
        
        # The result should be a FilesListResponse object due to output_type
        logger.info(f"Files agent result type: {type(result.final_output)}")
        logger.info(f"Files agent result: {result.final_output}")
        
        # Since we're using structured output, the result should be directly usable
        if isinstance(result.final_output, FilesListResponse):
            return result.final_output.model_dump()
        else:
            # Fallback parsing if structured output didn't work as expected
            import json
            import re
            
            json_match = re.search(r'\{.*\}', str(result.final_output), re.DOTALL)
            if json_match:
                files_data = json.loads(json_match.group())
                return files_data
            else:
                return {"files": [], "error": "Could not parse files list"}
            
    except Exception as e:
        logger.error(f"Error getting files: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Always cleanup the MCP connection
        if mcp_server:
            try:
                await mcp_server.cleanup()
                logger.info("MCP server cleanup completed for files request")
            except Exception as e:
                logger.warning(f"MCP server cleanup failed: {e}")

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload a file to the knowledge base"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    
    logger.info(f"Received file upload: {file.filename}")
    
    agent = None
    mcp_server = None
    
    try:
        # Create a fresh agent and MCP connection for this request
        agent, mcp_server = await create_agent()
        
        # Read the file content
        file_content = await file.read()
        
        # Determine if this is an image or document
        file_ext = os.path.splitext(file.filename)[1] if file.filename else ""
        image_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.webp'}
        file_ext_lower = file_ext.lower()
        
        # Use the MCP server's call_tool method directly
        if file_ext_lower in image_extensions:
            # For images, convert to base64 for Cloudflare Workers
            logger.info(f"Processing image upload: {file.filename}")
            file_base64 = base64.b64encode(file_content).decode('utf-8')
            logger.info(f"Converted {len(file_content)} bytes to base64")
            
            # Call the tool directly through the MCP server
            logger.info("Calling upload_image tool directly through MCP server...")
            result = await mcp_server.call_tool(
                "upload_image",
                {
                    "file_base64": file_base64,
                    "original_filename": file.filename
                }
            )
            
        else:
            # For documents - check if we're using local MCP server or Cloudflare Worker
            logger.info(f"Processing document upload: {file.filename}")
            
            # Check file size
            file_size_mb = len(file_content) / (1024 * 1024)
            logger.info(f"File size: {file_size_mb:.2f} MB ({len(file_content)} bytes)")
            
            if file_size_mb > 10:  # Limit to 10MB for now
                raise HTTPException(status_code=413, detail=f"File too large: {file_size_mb:.2f} MB. Maximum size is 10 MB.")
            
            # Check if we're connecting to local MCP server or Cloudflare Worker
            mcp_url = os.getenv('MCP_SERVER_URL', 'http://localhost:3000/mcp')
            is_local = 'localhost' in mcp_url or '127.0.0.1' in mcp_url
            
            if is_local:
                # Local MCP server - save to temp file and use file_path
                logger.info(f"Using local MCP server - saving to temp file for full text extraction")
                with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as temp_file:
                    temp_file.write(file_content)
                    temp_path = temp_file.name
                
                logger.info(f"Saved to temp file: {temp_path}")
                logger.info("Calling upload_document tool with file_path...")
                try:
                    result = await mcp_server.call_tool(
                        "upload_document",
                        {"file_path": temp_path}
                    )
                    # Clean up temp file after successful upload
                    try:
                        os.unlink(temp_path)
                        logger.info(f"Cleaned up temp file: {temp_path}")
                    except:
                        pass
                except Exception as e:
                    # Clean up temp file on error
                    try:
                        os.unlink(temp_path)
                    except:
                        pass
                    logger.error(f"Error calling upload_document tool: {e}")
                    raise
            else:
                # Cloudflare Worker - check size limits for base64 encoding
                if file_size_mb > 2:
                    logger.info(f"Large file detected ({file_size_mb:.2f} MB) for Cloudflare Worker")
                    raise HTTPException(
                        status_code=413, 
                        detail=f"Files larger than 2MB are not supported via Cloudflare Worker due to request size limits. Your file is {file_size_mb:.2f} MB. Please use the local MCP server for larger files."
                    )
                
                # Small file for Cloudflare Worker, use base64 encoding
                file_base64 = base64.b64encode(file_content).decode('utf-8')
                base64_size_mb = len(file_base64) / (1024 * 1024)
                logger.info(f"Converted to base64: {base64_size_mb:.2f} MB for Cloudflare Worker")
                
                logger.info("Calling upload_document tool with base64 data...")
                try:
                    result = await mcp_server.call_tool(
                        "upload_document",
                        {
                            "file_base64": file_base64,
                            "original_filename": file.filename
                        }
                    )
                except asyncio.TimeoutError:
                    logger.error("Timeout during document upload")
                    raise HTTPException(status_code=504, detail="Upload timed out. Please try a smaller file.")
                except Exception as e:
                    logger.error(f"Error calling upload_document tool: {e}")
                    raise
        
        logger.info(f"Tool call result: {result}")
        
        # Parse the result based on type
        from mcp.types import CallToolResult
        
        if isinstance(result, CallToolResult):
            # Handle MCP CallToolResult type
            if result.content and len(result.content) > 0:
                text_content = result.content[0].text if hasattr(result.content[0], 'text') else str(result.content[0])
                try:
                    parsed = json.loads(text_content)
                    if isinstance(parsed, dict):
                        if parsed.get('success'):
                            document_id = parsed.get('document', {}).get('id')
                            return {
                                "status": "success",
                                "filename": file.filename,
                                "document_id": document_id,
                                "message": f"Successfully uploaded {file.filename}",
                                "details": parsed
                            }
                        else:
                            error_msg = parsed.get('error', 'Unknown error')
                            error_details = parsed.get('details', '')
                            logger.error(f"Upload failed: {error_msg} - {error_details}")
                            raise HTTPException(status_code=500, detail=f"{error_msg}: {error_details}")
                except json.JSONDecodeError:
                    logger.error(f"Failed to parse JSON response: {text_content}")
                    raise HTTPException(status_code=500, detail="Invalid response from upload tool")
            else:
                logger.error("Empty CallToolResult content")
                raise HTTPException(status_code=500, detail="Empty response from upload tool")
        elif isinstance(result, dict):
            # Direct result from tool
            if result.get('success'):
                document_id = result.get('document', {}).get('id')
                return {
                    "status": "success",
                    "filename": file.filename,
                    "document_id": document_id,
                    "message": f"Successfully uploaded {file.filename}",
                    "details": result
                }
            else:
                error_msg = result.get('error', 'Unknown error')
                logger.error(f"Upload failed: {error_msg}")
                raise HTTPException(status_code=500, detail=error_msg)
        elif isinstance(result, list) and len(result) > 0:
            # Result might be a list of content items
            content = result[0] if isinstance(result[0], dict) else {'text': str(result[0])}
            text_content = content.get('text', '')
            
            # Try to parse as JSON
            try:
                parsed = json.loads(text_content) if isinstance(text_content, str) else text_content
                if isinstance(parsed, dict):
                    if parsed.get('success'):
                        document_id = parsed.get('document', {}).get('id')
                        return {
                            "status": "success",
                            "filename": file.filename,
                            "document_id": document_id,
                            "message": f"Successfully uploaded {file.filename}",
                            "details": parsed
                        }
                    else:
                        error_msg = parsed.get('error', 'Unknown error')
                        logger.error(f"Upload failed: {error_msg}")
                        raise HTTPException(status_code=500, detail=error_msg)
            except json.JSONDecodeError:
                # If not JSON, treat as success with raw response
                logger.info(f"Non-JSON response, assuming success: {text_content}")
                return {
                    "status": "success",
                    "filename": file.filename,
                    "document_id": None,
                    "message": f"Uploaded {file.filename}",
                    "details": text_content
                }
        else:
            # Unknown result format
            logger.warning(f"Unknown result format: {type(result)} - {result}")
            return {
                "status": "success",
                "filename": file.filename,
                "document_id": None,
                "message": f"Uploaded {file.filename}",
                "details": str(result)
            }
                
    except Exception as e:
        logger.error(f"Error uploading file: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Always cleanup the MCP connection
        if mcp_server:
            try:
                await mcp_server.cleanup()
                logger.info("MCP server cleanup completed for upload request")
            except Exception as e:
                logger.warning(f"MCP server cleanup failed: {e}")

class DeleteRequest(BaseModel):
    document_ids: Optional[List[str]] = None
    document_id: Optional[str] = None

@app.delete("/api/files")
async def delete_files(request: DeleteRequest):
    """Delete one or more files from the knowledge base"""
    
    # Determine if this is a single or bulk delete
    if request.document_id:
        # Single delete
        logger.info(f"Received request to delete single file: {request.document_id}")
        document_ids = [request.document_id]
        is_bulk = False
    elif request.document_ids and len(request.document_ids) > 0:
        # Bulk delete
        logger.info(f"Received request to bulk delete {len(request.document_ids)} files")
        document_ids = request.document_ids
        is_bulk = True
    else:
        raise HTTPException(status_code=400, detail="Either document_id or document_ids must be provided")
    
    agent = None
    mcp_server = None
    
    try:
        # Create a fresh agent and MCP connection for this request
        agent, mcp_server = await create_agent()
        
        if is_bulk and len(document_ids) > 1:
            # Use delete_documents tool for bulk delete
            ids_str = ", ".join(f'"{id}"' for id in document_ids)
            message = f"Please use the delete_documents tool to delete multiple documents with ids: [{ids_str}]"
        else:
            # Use delete_document tool for single delete
            message = f"Please use the delete_document tool to delete the document with id: {document_ids[0]}"
        
        result = await Runner.run(agent, message)
        
        # Check if deletion was successful
        if "successfully" in result.final_output.lower() or "deleted" in result.final_output.lower():
            return {
                "status": "success",
                "message": f"Successfully deleted {len(document_ids)} document(s)",
                "details": result.final_output
            }
        else:
            raise HTTPException(status_code=400, detail=result.final_output)
            
    except Exception as e:
        logger.error(f"Error deleting file(s): {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Always cleanup the MCP connection
        if mcp_server:
            try:
                await mcp_server.cleanup()
                logger.info("MCP server cleanup completed for delete request")
            except Exception as e:
                logger.warning(f"MCP server cleanup failed: {e}")

# Keep the old endpoint for backward compatibility
@app.delete("/api/files/{document_id}")
async def delete_file_legacy(document_id: str):
    """Legacy endpoint - Delete a single file from the knowledge base"""
    return await delete_files(DeleteRequest(document_id=document_id))

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 3001))
    uvicorn.run(app, host="0.0.0.0", port=port)