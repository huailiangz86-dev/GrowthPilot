from pydantic import BaseModel


class SymbolItem(BaseModel):
    code: str
    name: str
    market: str  # A / HK
    pinyin_initials: str
    pinyin_full: str
