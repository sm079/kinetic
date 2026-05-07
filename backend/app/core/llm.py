import os
from dotenv import load_dotenv
from langchain_core.language_models import BaseChatModel

load_dotenv()


def get_llm() -> BaseChatModel:
    provider = os.getenv("LLM_PROVIDER", "anthropic").lower()
    model = os.getenv("LLM_MODEL", "claude-sonnet-4-6")

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(model=model, api_key=os.getenv("ANTHROPIC_API_KEY"), streaming=True)

    if provider == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model=model, api_key=os.getenv("OPENAI_API_KEY"), streaming=True)

    if provider == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(model=model, google_api_key=os.getenv("GOOGLE_API_KEY"))

    if provider == "groq":
        from langchain_groq import ChatGroq
        return ChatGroq(model=model, api_key=os.getenv("GROQ_API_KEY"), streaming=True)

    raise ValueError(f"Unsupported LLM_PROVIDER: '{provider}'")
