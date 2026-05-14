from langchain_core.language_models import BaseChatModel

from app.core.config import settings


def get_llm() -> BaseChatModel:
    provider = settings.llm_provider.lower()
    model = settings.llm_model

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(model=model, api_key=settings.anthropic_api_key, streaming=True)

    if provider == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model=model, api_key=settings.openai_api_key, streaming=True)

    if provider == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(model=model, google_api_key=settings.google_api_key)

    if provider == "groq":
        from langchain_groq import ChatGroq
        return ChatGroq(model=model, api_key=settings.groq_api_key, streaming=True)

    raise ValueError(f"Unsupported LLM_PROVIDER: '{provider}'")
