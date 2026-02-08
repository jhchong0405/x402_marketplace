"""
Trading Agent Main Entry Point

LangChain agent that uses x402 for paid data and Polymarket for trading.
"""

import os
import sys
from dotenv import load_dotenv

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

load_dotenv()

from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

from agent.prompts import SYSTEM_PROMPT
from agent.tools import get_all_tools


def create_agent() -> AgentExecutor:
    """Create the trading agent."""
    
    # Initialize LLM with Qwen via OpenAI-compatible API
    llm = ChatOpenAI(
        model=os.getenv("OPENAI_MODEL", "qwen-max"),
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        openai_api_base=os.getenv("AI_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
        temperature=0.7,
    )
    
    # Get tools
    tools = get_all_tools()
    
    # Create prompt
    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", "{input}"),
        MessagesPlaceholder(variable_name="agent_scratchpad"),
    ])
    
    # Create agent
    agent = create_openai_tools_agent(llm, tools, prompt)
    
    # Create executor
    executor = AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=True,
        handle_parsing_errors=True,
        max_iterations=10,
    )
    
    return executor


def main():
    """Interactive main loop."""
    print("=" * 60)
    print("🤖 Trading Agent")
    print("=" * 60)
    print()
    print("This agent can:")
    print("  • Access x402 paid reports")
    print("  • Analyze market data")
    print("  • Execute trades on Polymarket (max 10 shares)")
    print()
    print("Enter a market slug or topic to analyze.")
    print("Type 'quit' or 'exit' to stop.")
    print()
    
    # Check configuration
    x402_url = os.getenv("X402_MARKET_URL")
    if not x402_url or x402_url.startswith("<"):
        print("⚠️  Warning: X402_MARKET_URL not configured")
    
    poly_key = os.getenv("POLY_PRIVATE_KEY")
    if not poly_key or poly_key.startswith("<"):
        print("⚠️  Warning: Polymarket not configured (will use mock responses)")
    
    print("-" * 60)
    
    # Create agent
    try:
        agent = create_agent()
    except Exception as e:
        print(f"❌ Failed to create agent: {e}")
        print("Make sure OPENAI_API_KEY is configured in .env")
        return
    
    # Interactive loop
    while True:
        try:
            user_input = input("\n📝 Input: ").strip()
            
            if not user_input:
                continue
            
            if user_input.lower() in ("quit", "exit", "q"):
                print("👋 Goodbye!")
                break
            
            print("\n🔄 Processing...\n")
            
            # Run agent
            result = agent.invoke({"input": user_input})
            
            print("\n" + "=" * 60)
            print("📊 Result:")
            print("=" * 60)
            print(result.get("output", "No output"))
            
        except KeyboardInterrupt:
            print("\n\n👋 Goodbye!")
            break
        except Exception as e:
            print(f"\n❌ Error: {e}")


if __name__ == "__main__":
    main()
