# backend/models/schemas.py
from pydantic import BaseModel


class ErrorResponse(BaseModel):
    error: str
    code: str


class SearchResult(BaseModel):
    name: str
    symbol: str
    exchange: str | None = None
    type: str | None = None


class SearchResponse(BaseModel):
    results: list[SearchResult]


class QuoteData(BaseModel):
    symbol: str
    name: str | None = None
    price: float | None = None
    previous_close: float | None = None
    change: float | None = None
    change_percent: float | None = None
    volume: int | None = None
    market_cap: int | None = None
    day_high: float | None = None
    day_low: float | None = None
    open: float | None = None
    currency: str = "INR"


class OverviewData(BaseModel):
    symbol: str
    name: str | None = None
    sector: str | None = None
    industry: str | None = None
    website: str | None = None
    description: str | None = None
    market_cap: int | None = None
    enterprise_value: int | None = None
    fifty_two_week_high: float | None = None
    fifty_two_week_low: float | None = None
    fifty_day_average: float | None = None
    two_hundred_day_average: float | None = None
    employees: int | None = None
    currency: str = "INR"


class FinancialsData(BaseModel):
    symbol: str
    pe_ratio: float | None = None
    forward_pe: float | None = None
    eps: float | None = None
    forward_eps: float | None = None
    peg_ratio: float | None = None
    price_to_book: float | None = None
    debt_to_equity: float | None = None
    return_on_equity: float | None = None
    return_on_assets: float | None = None
    profit_margin: float | None = None
    operating_margin: float | None = None
    gross_margin: float | None = None
    revenue: int | None = None
    revenue_growth: float | None = None
    earnings_growth: float | None = None
    book_value: float | None = None
    dividend_yield: float | None = None


class HistoryPoint(BaseModel):
    date: str
    open: float | None = None
    high: float | None = None
    low: float | None = None
    close: float | None = None
    volume: int | None = None


class HistoryResponse(BaseModel):
    symbol: str
    data: list[HistoryPoint]


class DividendEntry(BaseModel):
    date: str
    amount: float


class SplitEntry(BaseModel):
    date: str
    ratio: str


class DividendsData(BaseModel):
    symbol: str
    dividend_yield: float | None = None
    dividend_rate: float | None = None
    ex_dividend_date: str | None = None
    payout_ratio: float | None = None
    five_year_avg_yield: float | None = None
    history: list[DividendEntry]
    splits: list[SplitEntry]


class AnalystRating(BaseModel):
    period: str
    strong_buy: int = 0
    buy: int = 0
    hold: int = 0
    sell: int = 0
    strong_sell: int = 0


class AnalystsData(BaseModel):
    symbol: str
    target_mean_price: float | None = None
    target_high_price: float | None = None
    target_low_price: float | None = None
    target_median_price: float | None = None
    recommendation: str | None = None
    number_of_analysts: int | None = None
    ratings: list[AnalystRating]


class HolderEntry(BaseModel):
    name: str
    shares: int | None = None
    date_reported: str | None = None
    percent_held: float | None = None
    value: int | None = None


class HoldersData(BaseModel):
    symbol: str
    institutional: list[HolderEntry]
    mutual_fund: list[HolderEntry]


class EarningsEntry(BaseModel):
    date: str
    actual: float | None = None
    estimate: float | None = None
    surprise: float | None = None
    surprise_percent: float | None = None


class EarningsData(BaseModel):
    symbol: str
    earnings_date: str | None = None
    history: list[EarningsEntry]


class SummaryData(BaseModel):
    quote: QuoteData
    overview: OverviewData
    financials: FinancialsData
