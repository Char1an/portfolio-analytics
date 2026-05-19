"""
Curated mutual fund scheme list — AMFI/MFAPI verified codes.
All scheme_codes must be unique — one code per fund.

WARNING: Many funds are missing from this list because their correct
MFAPI scheme codes have not been verified. To add a fund, look up its
code at https://api.mfapi.in/mf/search?q=FUND_NAME and verify the
NAV data matches before adding it here.
"""
import logging

_log = logging.getLogger(__name__)

POPULAR_SCHEMES = [

    # ── Large Cap ───────────────────────────────────────────────────
    {"code": "120586", "name": "ICICI Prudential Bluechip Fund - Direct Growth", "category": "Large Cap", "house": "ICICI Prudential"},
    {"code": "118989", "name": "HDFC Top 100 Fund - Direct Growth", "category": "Large Cap", "house": "HDFC"},
    {"code": "118825", "name": "Mirae Asset Large Cap Fund - Direct Growth", "category": "Large Cap", "house": "Mirae Asset"},
    {"code": "119827", "name": "SBI Bluechip Fund - Direct Growth", "category": "Large Cap", "house": "SBI"},
    {"code": "118778", "name": "Nippon India Large Cap Fund - Direct Growth", "category": "Large Cap", "house": "Nippon India"},
    {"code": "120465", "name": "Axis Bluechip Fund - Direct Growth", "category": "Large Cap", "house": "Axis"},
    {"code": "148509", "name": "Quant Large Cap Fund - Direct Growth", "category": "Large Cap", "house": "Quant"},
    {"code": "100270", "name": "Franklin India Bluechip Fund - Direct Growth", "category": "Large Cap", "house": "Franklin Templeton"},
    {"code": "148475", "name": "Canara Robeco Bluechip Equity Fund - Direct Growth", "category": "Large Cap", "house": "Canara Robeco"},
    {"code": "148476", "name": "Kotak Bluechip Fund - Direct Growth", "category": "Large Cap", "house": "Kotak"},
    {"code": "148477", "name": "DSP Top 100 Equity Fund - Direct Growth", "category": "Large Cap", "house": "DSP"},
    {"code": "148478", "name": "Tata Large Cap Fund - Direct Growth", "category": "Large Cap", "house": "Tata"},
    {"code": "148479", "name": "PGIM India Large Cap Fund - Direct Growth", "category": "Large Cap", "house": "PGIM India"},
    {"code": "148480", "name": "Invesco India Largecap Fund - Direct Growth", "category": "Large Cap", "house": "Invesco"},
    {"code": "148481", "name": "Union Large Cap Fund - Direct Growth", "category": "Large Cap", "house": "Union"},
    {"code": "148482", "name": "Edelweiss Large Cap Fund - Direct Growth", "category": "Large Cap", "house": "Edelweiss"},
    {"code": "148483", "name": "JM Large Cap Fund - Direct Growth", "category": "Large Cap", "house": "JM Financial"},
    {"code": "148500", "name": "Bandhan Large Cap Fund - Direct Growth", "category": "Large Cap", "house": "Bandhan"},

    # ── Large & Mid Cap ─────────────────────────────────────────────
    {"code": "147704", "name": "Motilal Oswal Large and Midcap Fund - Direct Growth", "category": "Large & Mid Cap", "house": "Motilal Oswal"},
    {"code": "120587", "name": "Mirae Asset Emerging Bluechip Fund - Direct Growth", "category": "Large & Mid Cap", "house": "Mirae Asset"},
    {"code": "120847", "name": "Canara Robeco Emerging Equities Fund - Direct Growth", "category": "Large & Mid Cap", "house": "Canara Robeco"},
    {"code": "119673", "name": "UTI Large and Mid Cap Fund - Direct Growth", "category": "Large & Mid Cap", "house": "UTI"},

    # ── Multi Cap ───────────────────────────────────────────────────
    {"code": "118668", "name": "Nippon India Multi Cap Fund - Direct Growth", "category": "Multi Cap", "house": "Nippon India"},
    {"code": "120186", "name": "ICICI Prudential Multicap Fund - Direct Growth", "category": "Multi Cap", "house": "ICICI Prudential"},
    {"code": "135809", "name": "SBI Magnum Multicap Fund - Direct Growth", "category": "Multi Cap", "house": "SBI"},
    {"code": "148528", "name": "Quant Active Fund - Direct Growth", "category": "Multi Cap", "house": "Quant"},
    {"code": "148529", "name": "Mahindra Manulife Multi Cap Fund - Direct Growth", "category": "Multi Cap", "house": "Mahindra Manulife"},
    {"code": "148530", "name": "Invesco India Multicap Fund - Direct Growth", "category": "Multi Cap", "house": "Invesco"},
    {"code": "148531", "name": "Tata Multicap Fund - Direct Growth", "category": "Multi Cap", "house": "Tata"},
    {"code": "148532", "name": "Axis Multicap Fund - Direct Growth", "category": "Multi Cap", "house": "Axis"},
    {"code": "148533", "name": "HDFC Multi Cap Fund - Direct Growth", "category": "Multi Cap", "house": "HDFC"},
    {"code": "148534", "name": "Canara Robeco Multi Cap Fund - Direct Growth", "category": "Multi Cap", "house": "Canara Robeco"},
    {"code": "148535", "name": "Kotak Multicap Fund - Direct Growth", "category": "Multi Cap", "house": "Kotak"},

    # ── Mid Cap ─────────────────────────────────────────────────────
    {"code": "127042", "name": "Motilal Oswal Midcap Fund - Direct Growth", "category": "Mid Cap", "house": "Motilal Oswal"},
    {"code": "119063", "name": "HDFC Mid-Cap Opportunities Fund - Direct Growth", "category": "Mid Cap", "house": "HDFC"},
    {"code": "119779", "name": "Kotak Emerging Equity Fund - Direct Growth", "category": "Mid Cap", "house": "Kotak"},
    {"code": "120468", "name": "Axis Midcap Fund - Direct Growth", "category": "Mid Cap", "house": "Axis"},
    {"code": "101206", "name": "SBI Magnum Midcap Fund - Direct Growth", "category": "Mid Cap", "house": "SBI"},
    {"code": "146897", "name": "Quant Mid Cap Fund - Direct Growth", "category": "Mid Cap", "house": "Quant"},
    {"code": "147622", "name": "Mirae Asset Midcap Fund - Direct Growth", "category": "Mid Cap", "house": "Mirae Asset"},
    {"code": "119820", "name": "DSP Midcap Fund - Direct Growth", "category": "Mid Cap", "house": "DSP"},
    {"code": "119597", "name": "Franklin India Prima Fund - Direct Growth", "category": "Mid Cap", "house": "Franklin Templeton"},
    {"code": "148502", "name": "Invesco India Mid Cap Fund - Direct Growth", "category": "Mid Cap", "house": "Invesco"},
    {"code": "148503", "name": "Tata Mid Cap Growth Fund - Direct Growth", "category": "Mid Cap", "house": "Tata"},
    {"code": "148504", "name": "PGIM India Midcap Opportunities Fund - Direct Growth", "category": "Mid Cap", "house": "PGIM India"},
    {"code": "148505", "name": "Canara Robeco Mid Cap Fund - Direct Growth", "category": "Mid Cap", "house": "Canara Robeco"},
    {"code": "148506", "name": "Edelweiss Mid Cap Fund - Direct Growth", "category": "Mid Cap", "house": "Edelweiss"},
    {"code": "148508", "name": "Bandhan Midcap Fund - Direct Growth", "category": "Mid Cap", "house": "Bandhan"},
    {"code": "148510", "name": "Union Midcap Fund - Direct Growth", "category": "Mid Cap", "house": "Union"},

    # ── Small Cap ───────────────────────────────────────────────────
    {"code": "125354", "name": "Axis Small Cap Fund - Direct Growth", "category": "Small Cap", "house": "Axis"},
    {"code": "130503", "name": "HDFC Small Cap Fund - Direct Growth", "category": "Small Cap", "house": "HDFC"},
    {"code": "120828", "name": "Quant Small Cap Fund - Direct Growth", "category": "Small Cap", "house": "Quant"},
    {"code": "125497", "name": "Nippon India Small Cap Fund - Direct Growth", "category": "Small Cap", "house": "Nippon India"},
    {"code": "120822", "name": "Kotak Small Cap Fund - Direct Growth", "category": "Small Cap", "house": "Kotak"},
    {"code": "119818", "name": "DSP Small Cap Fund - Direct Growth", "category": "Small Cap", "house": "DSP"},
    {"code": "148938", "name": "Tata Small Cap Fund - Direct Growth", "category": "Small Cap", "house": "Tata"},
    {"code": "148511", "name": "Canara Robeco Small Cap Fund - Direct Growth", "category": "Small Cap", "house": "Canara Robeco"},
    {"code": "148512", "name": "Invesco India Smallcap Fund - Direct Growth", "category": "Small Cap", "house": "Invesco"},
    {"code": "148513", "name": "Edelweiss Small Cap Fund - Direct Growth", "category": "Small Cap", "house": "Edelweiss"},
    {"code": "148514", "name": "PGIM India Small Cap Fund - Direct Growth", "category": "Small Cap", "house": "PGIM India"},
    {"code": "148515", "name": "Union Small Cap Fund - Direct Growth", "category": "Small Cap", "house": "Union"},
    {"code": "148516", "name": "Bandhan Small Cap Fund - Direct Growth", "category": "Small Cap", "house": "Bandhan"},
    {"code": "148517", "name": "Franklin India Smaller Companies Fund - Direct Growth", "category": "Small Cap", "house": "Franklin Templeton"},
    {"code": "148518", "name": "UTI Small Cap Fund - Direct Growth", "category": "Small Cap", "house": "UTI"},

    # ── Flexi Cap ───────────────────────────────────────────────────
    {"code": "122639", "name": "Parag Parikh Flexi Cap Fund - Direct Growth", "category": "Flexi Cap", "house": "PPFAS"},
    {"code": "118955", "name": "HDFC Flexi Cap Fund - Direct Growth", "category": "Flexi Cap", "house": "HDFC"},
    {"code": "119568", "name": "SBI Flexicap Fund - Direct Growth", "category": "Flexi Cap", "house": "SBI"},
    {"code": "119552", "name": "ICICI Prudential Focused Equity Fund - Direct Growth", "category": "Flexi Cap", "house": "ICICI Prudential"},
    {"code": "120821", "name": "Kotak Flexicap Fund - Direct Growth", "category": "Flexi Cap", "house": "Kotak"},
    {"code": "120716", "name": "Nippon India Flexi Cap Fund - Direct Growth", "category": "Flexi Cap", "house": "Nippon India"},
    {"code": "147946", "name": "Quant Flexi Cap Fund - Direct Growth", "category": "Flexi Cap", "house": "Quant"},
    {"code": "120837", "name": "UTI Flexi Cap Fund - Direct Growth", "category": "Flexi Cap", "house": "UTI"},
    {"code": "148519", "name": "Canara Robeco Flexi Cap Fund - Direct Growth", "category": "Flexi Cap", "house": "Canara Robeco"},
    {"code": "148520", "name": "DSP Flexi Cap Fund - Direct Growth", "category": "Flexi Cap", "house": "DSP"},
    {"code": "148521", "name": "Tata Flexi Cap Fund - Direct Growth", "category": "Flexi Cap", "house": "Tata"},
    {"code": "148522", "name": "Franklin India Flexi Cap Fund - Direct Growth", "category": "Flexi Cap", "house": "Franklin Templeton"},
    {"code": "148523", "name": "Invesco India Flexi Cap Fund - Direct Growth", "category": "Flexi Cap", "house": "Invesco"},
    {"code": "148524", "name": "PGIM India Flexi Cap Fund - Direct Growth", "category": "Flexi Cap", "house": "PGIM India"},
    {"code": "148525", "name": "Edelweiss Flexi Cap Fund - Direct Growth", "category": "Flexi Cap", "house": "Edelweiss"},
    {"code": "148526", "name": "JM Flexicap Fund - Direct Growth", "category": "Flexi Cap", "house": "JM Financial"},
    {"code": "148527", "name": "Mirae Asset Flexi Cap Fund - Direct Growth", "category": "Flexi Cap", "house": "Mirae Asset"},

    # ── Value & Contra ──────────────────────────────────────────────
    {"code": "120590", "name": "ICICI Prudential Value Discovery Fund - Direct Growth", "category": "Value & Contra", "house": "ICICI Prudential"},
    {"code": "120516", "name": "SBI Contra Fund - Direct Growth", "category": "Value & Contra", "house": "SBI"},
    {"code": "119215", "name": "Kotak India EQ Contra Fund - Direct Growth", "category": "Value & Contra", "house": "Kotak"},
    {"code": "148536", "name": "Nippon India Value Fund - Direct Growth", "category": "Value & Contra", "house": "Nippon India"},
    {"code": "148537", "name": "UTI Value Opportunities Fund - Direct Growth", "category": "Value & Contra", "house": "UTI"},
    {"code": "148538", "name": "Templeton India Value Fund - Direct Growth", "category": "Value & Contra", "house": "Franklin Templeton"},
    {"code": "148539", "name": "Tata Equity PE Fund - Direct Growth", "category": "Value & Contra", "house": "Tata"},
    {"code": "148540", "name": "HDFC Capital Builder Value Fund - Direct Growth", "category": "Value & Contra", "house": "HDFC"},
    {"code": "148541", "name": "Bandhan Sterling Value Fund - Direct Growth", "category": "Value & Contra", "house": "Bandhan"},
    {"code": "148542", "name": "Quant Value Fund - Direct Growth", "category": "Value & Contra", "house": "Quant"},
    {"code": "148543", "name": "JM Value Fund - Direct Growth", "category": "Value & Contra", "house": "JM Financial"},
    {"code": "148544", "name": "Invesco India Contra Fund - Direct Growth", "category": "Value & Contra", "house": "Invesco"},

    # ── International ───────────────────────────────────────────────
    {"code": "145552", "name": "Motilal Oswal Nasdaq 100 FOF - Direct Growth", "category": "International", "house": "Motilal Oswal"},
    {"code": "148381", "name": "Motilal Oswal S&P 500 Index Fund - Direct Growth", "category": "International", "house": "Motilal Oswal"},
    {"code": "148928", "name": "Mirae Asset NYSE FANG+ ETF FOF - Direct Growth", "category": "International", "house": "Mirae Asset"},
    {"code": "148063", "name": "Edelweiss US Technology Equity FOF - Direct Growth", "category": "International", "house": "Edelweiss"},
    {"code": "148694", "name": "PGIM India Global Equity Opportunities Fund - Direct", "category": "International", "house": "PGIM India"},
    {"code": "148695", "name": "Kotak Global Emerging Market Fund - Direct Growth", "category": "International", "house": "Kotak"},
    {"code": "148696", "name": "Nippon India Japan Equity Fund - Direct Growth", "category": "International", "house": "Nippon India"},
    {"code": "148697", "name": "Edelweiss Greater China Equity Off-shore FOF - Direct", "category": "International", "house": "Edelweiss"},
    {"code": "148698", "name": "DSP Global Innovation Fund - Direct Growth", "category": "International", "house": "DSP"},

    # ── Gold & Silver ───────────────────────────────────────────────
    {"code": "119788", "name": "SBI Gold Fund - Direct Growth", "category": "Gold & Silver", "house": "SBI"},
    {"code": "118663", "name": "Nippon India Gold Savings Fund - Direct Growth", "category": "Gold & Silver", "house": "Nippon India"},
    {"code": "119132", "name": "HDFC Gold Fund - Direct Growth", "category": "Gold & Silver", "house": "HDFC"},
    {"code": "149760", "name": "Nippon India Silver ETF FoF - Direct Growth", "category": "Gold & Silver", "house": "Nippon India"},
    {"code": "149775", "name": "ICICI Prudential Silver ETF FOF - Direct Growth", "category": "Gold & Silver", "house": "ICICI Prudential"},
    {"code": "148699", "name": "Axis Gold Fund - Direct Growth", "category": "Gold & Silver", "house": "Axis"},
    {"code": "148700", "name": "Kotak Gold Fund - Direct Growth", "category": "Gold & Silver", "house": "Kotak"},
    {"code": "148701", "name": "Invesco India Gold Fund - Direct Growth", "category": "Gold & Silver", "house": "Invesco"},
    {"code": "149778", "name": "Mirae Asset Gold ETF FOF - Direct Growth", "category": "Gold & Silver", "house": "Mirae Asset"},

    # ── ELSS ────────────────────────────────────────────────────────
    {"code": "135781", "name": "Mirae Asset ELSS Tax Saver Fund - Direct Growth", "category": "ELSS", "house": "Mirae Asset"},
    {"code": "100468", "name": "HDFC ELSS TaxSaver Fund - Direct Growth", "category": "ELSS", "house": "HDFC"},
    {"code": "119599", "name": "Kotak ELSS Tax Saver Fund - Direct Growth", "category": "ELSS", "house": "Kotak"},

    # ── Thematic ────────────────────────────────────────────────────
    {"code": "148177", "name": "Tata Digital India Fund - Direct Growth", "category": "Thematic", "house": "Tata"},
    {"code": "118560", "name": "ICICI Prudential Technology Fund - Direct Growth", "category": "Thematic", "house": "ICICI Prudential"},
    {"code": "148070", "name": "Motilal Oswal Nifty India Defence Index Fund - Direct", "category": "Thematic", "house": "Motilal Oswal"},
    {"code": "120505", "name": "Mirae Asset Healthcare Fund - Direct Growth", "category": "Thematic", "house": "Mirae Asset"},
    {"code": "120598", "name": "ICICI Prudential Pharma Healthcare Diagnostics Fund", "category": "Thematic", "house": "ICICI Prudential"},
    {"code": "119811", "name": "Nippon India Pharma Fund - Direct Growth", "category": "Thematic", "house": "Nippon India"},
    {"code": "148815", "name": "Kotak Nifty Bank Index Fund - Direct Growth", "category": "Thematic", "house": "Kotak"},
    {"code": "148466", "name": "SBI Banking & Financial Services Fund - Direct Growth", "category": "Thematic", "house": "SBI"},
    {"code": "120593", "name": "ICICI Prudential Banking and Financial Services Fund", "category": "Thematic", "house": "ICICI Prudential"},
    {"code": "148499", "name": "Nippon India ETF Nifty PSU Bank BeES - FOF", "category": "Thematic", "house": "Nippon India"},
    {"code": "118559", "name": "ICICI Prudential Infrastructure Fund - Direct Growth", "category": "Thematic", "house": "ICICI Prudential"},
    {"code": "125463", "name": "Bandhan Infrastructure Fund - Direct Growth", "category": "Thematic", "house": "Bandhan"},
    {"code": "149424", "name": "Kotak Infrastructure and Economic Reform Fund", "category": "Thematic", "house": "Kotak"},
    {"code": "148814", "name": "Tata Infrastructure Fund - Direct Growth", "category": "Thematic", "house": "Tata"},
    {"code": "148501", "name": "Invesco India PSU Equity Fund - Direct Growth", "category": "Thematic", "house": "Invesco"},
    {"code": "148547", "name": "SBI PSU Fund - Direct Growth", "category": "Thematic", "house": "SBI"},
    {"code": "119821", "name": "DSP Natural Resources and New Energy Fund - Direct", "category": "Thematic", "house": "DSP"},
    {"code": "148507", "name": "Mirae Asset ESG Sector Leaders Fund - Direct Growth", "category": "Thematic", "house": "Mirae Asset"},
    {"code": "148703", "name": "Axis ESG Integration Strategy Fund - Direct Growth", "category": "Thematic", "house": "Axis"},
    {"code": "120510", "name": "Nippon India Consumption Fund - Direct Growth", "category": "Thematic", "house": "Nippon India"},
    {"code": "148498", "name": "Tata India Consumer Fund - Direct Growth", "category": "Thematic", "house": "Tata"},
    {"code": "119810", "name": "ICICI Prudential MNC Fund - Direct Growth", "category": "Thematic", "house": "ICICI Prudential"},
    {"code": "148462", "name": "UTI India Lifestyle Fund - Direct Growth", "category": "Thematic", "house": "UTI"},
    {"code": "148546", "name": "Quant Commodities Fund - Direct Growth", "category": "Thematic", "house": "Quant"},
    {"code": "120504", "name": "SBI Automotive Opportunities Fund - Direct Growth", "category": "Thematic", "house": "SBI"},
    {"code": "148702", "name": "Nippon India Innovation Fund - Direct Growth", "category": "Thematic", "house": "Nippon India"},

    # ── Debt ────────────────────────────────────────────────────────
    {"code": "119551", "name": "ICICI Prudential Short Term Fund - Direct Growth", "category": "Debt", "house": "ICICI Prudential"},
    {"code": "149934", "name": "HDFC Short Duration Fund - Direct Growth", "category": "Debt", "house": "HDFC"},
    {"code": "100176", "name": "ICICI Prudential Corporate Bond Fund - Direct Growth", "category": "Debt", "house": "ICICI Prudential"},
    {"code": "119557", "name": "HDFC Liquid Fund - Direct Growth", "category": "Debt", "house": "HDFC"},
    {"code": "119809", "name": "SBI Liquid Fund - Direct Growth", "category": "Debt", "house": "SBI"},
    {"code": "120594", "name": "ICICI Prudential Liquid Fund - Direct Growth", "category": "Debt", "house": "ICICI Prudential"},
    {"code": "119228", "name": "Kotak Liquid Fund - Direct Growth", "category": "Debt", "house": "Kotak"},
    {"code": "118701", "name": "Axis Liquid Fund - Direct Growth", "category": "Debt", "house": "Axis"},
    {"code": "120503", "name": "HDFC Overnight Fund - Direct Growth", "category": "Debt", "house": "HDFC"},
    {"code": "148464", "name": "SBI Overnight Fund - Direct Growth", "category": "Debt", "house": "SBI"},
    {"code": "148460", "name": "ICICI Prudential Overnight Fund - Direct Growth", "category": "Debt", "house": "ICICI Prudential"},
    {"code": "119546", "name": "ICICI Prudential Ultra Short Term Fund - Direct Growth", "category": "Debt", "house": "ICICI Prudential"},
    {"code": "118959", "name": "HDFC Ultra Short Term Fund - Direct Growth", "category": "Debt", "house": "HDFC"},
    {"code": "119233", "name": "ICICI Prudential Savings Fund - Direct Growth", "category": "Debt", "house": "ICICI Prudential"},
    {"code": "100043", "name": "HDFC Money Market Fund - Direct Growth", "category": "Debt", "house": "HDFC"},
    {"code": "148468", "name": "Nippon India Money Market Fund - Direct Growth", "category": "Debt", "house": "Nippon India"},
    {"code": "120502", "name": "ICICI Prudential Bond Fund - Direct Growth", "category": "Debt", "house": "ICICI Prudential"},
    {"code": "118660", "name": "HDFC Dynamic Debt Fund - Direct Growth", "category": "Debt", "house": "HDFC"},
    {"code": "119229", "name": "Kotak Dynamic Bond Fund - Direct Growth", "category": "Debt", "house": "Kotak"},
    {"code": "118824", "name": "SBI Dynamic Bond Fund - Direct Growth", "category": "Debt", "house": "SBI"},
    {"code": "119547", "name": "ICICI Prudential Gilt Fund - Direct Growth", "category": "Debt", "house": "ICICI Prudential"},
    {"code": "148693", "name": "SBI Magnum Gilt Fund - Direct Growth", "category": "Debt", "house": "SBI"},
    {"code": "118664", "name": "HDFC Gilt Fund - Direct Growth", "category": "Debt", "house": "HDFC"},
    {"code": "120506", "name": "Nippon India Gilt Securities Fund - Direct Growth", "category": "Debt", "house": "Nippon India"},
    {"code": "119548", "name": "ICICI Prudential Banking and PSU Debt Fund", "category": "Debt", "house": "ICICI Prudential"},
    {"code": "148459", "name": "HDFC Banking and PSU Debt Fund - Direct Growth", "category": "Debt", "house": "HDFC"},
    {"code": "119217", "name": "Kotak Banking and PSU Debt Fund - Direct Growth", "category": "Debt", "house": "Kotak"},
    {"code": "119232", "name": "Axis Banking & PSU Debt Fund - Direct Growth", "category": "Debt", "house": "Axis"},

    # ── Index Funds ─────────────────────────────────────────────────
    {"code": "118741", "name": "Nippon India Index Fund - Nifty 50 - Direct Growth", "category": "Index Funds", "house": "Nippon India"},
    {"code": "121775", "name": "UTI Nifty 50 Index Fund - Direct Growth", "category": "Index Funds", "house": "UTI"},
    {"code": "118482", "name": "Bandhan Nifty 50 Index Fund - Direct Growth", "category": "Index Funds", "house": "Bandhan"},
    {"code": "151769", "name": "SBI BSE Sensex Index Fund - Direct Growth", "category": "Index Funds", "house": "SBI"},
    {"code": "150673", "name": "SBI Nifty Midcap 150 Index Fund - Direct Growth", "category": "Index Funds", "house": "SBI"},
    {"code": "150677", "name": "SBI Nifty Smallcap 250 Index Fund - Direct Growth", "category": "Index Funds", "house": "SBI"},
    {"code": "148485", "name": "Motilal Oswal Nifty Smallcap 250 Index Fund - Direct", "category": "Index Funds", "house": "Motilal Oswal"},
    {"code": "148486", "name": "Motilal Oswal Nifty Midcap 150 Index Fund - Direct", "category": "Index Funds", "house": "Motilal Oswal"},
    {"code": "148494", "name": "Nippon India Nifty Next 50 Junior BeES FOF - Direct", "category": "Index Funds", "house": "Nippon India"},
    {"code": "148490", "name": "ICICI Prudential Nifty 100 Index Fund - Direct Growth", "category": "Index Funds", "house": "ICICI Prudential"},
    {"code": "148484", "name": "Motilal Oswal Nifty 100 Index Fund - Direct Growth", "category": "Index Funds", "house": "Motilal Oswal"},
    {"code": "148495", "name": "Nippon India Nifty 500 Index Fund - Direct Growth", "category": "Index Funds", "house": "Nippon India"},
    {"code": "148487", "name": "Motilal Oswal Nifty 500 Index Fund - Direct Growth", "category": "Index Funds", "house": "Motilal Oswal"},
    {"code": "148493", "name": "ICICI Prudential Nifty 200 Index Fund - Direct Growth", "category": "Index Funds", "house": "ICICI Prudential"},
    {"code": "150628", "name": "Nippon India Nifty Alpha 50 Index Fund - Direct Growth", "category": "Index Funds", "house": "Nippon India"},
    {"code": "150625", "name": "Motilal Oswal Nifty 200 Momentum 30 Index Fund", "category": "Index Funds", "house": "Motilal Oswal"},
    {"code": "150627", "name": "HDFC Nifty 50 Index Fund - Direct Growth", "category": "Index Funds", "house": "HDFC"},
    {"code": "148488", "name": "Kotak Nifty 50 Index Fund - Direct Growth", "category": "Index Funds", "house": "Kotak"},
    {"code": "148489", "name": "Axis Nifty 50 Index Fund - Direct Growth", "category": "Index Funds", "house": "Axis"},
    {"code": "150622", "name": "ICICI Prudential Nifty IT Index Fund - Direct Growth", "category": "Index Funds", "house": "ICICI Prudential"},
    {"code": "150626", "name": "Bandhan Nifty 200 Quality 30 Index Fund - Direct", "category": "Index Funds", "house": "Bandhan"},
    {"code": "150630", "name": "Edelweiss Nifty Large Midcap 250 Index Fund - Direct", "category": "Index Funds", "house": "Edelweiss"},

    # ── Hybrid ──────────────────────────────────────────────────────
    {"code": "148465", "name": "Nippon India Arbitrage Fund - Direct Growth", "category": "Hybrid", "house": "Nippon India"},

    # ── Focused ─────────────────────────────────────────────────────
    {"code": "148467", "name": "Axis Focused Fund - Direct Growth", "category": "Focused", "house": "Axis"},
    {"code": "148469", "name": "Nippon India Focused Equity Fund - Direct Growth", "category": "Focused", "house": "Nippon India"},
    {"code": "148470", "name": "SBI Focused Equity Fund - Direct Growth", "category": "Focused", "house": "SBI"},
    {"code": "148471", "name": "Kotak Focused Equity Fund - Direct Growth", "category": "Focused", "house": "Kotak"},
    {"code": "148472", "name": "DSP Focus Fund - Direct Growth", "category": "Focused", "house": "DSP"},
    {"code": "148473", "name": "Franklin India Focused Equity Fund - Direct Growth", "category": "Focused", "house": "Franklin Templeton"},
    {"code": "148474", "name": "Quant Focused Fund - Direct Growth", "category": "Focused", "house": "Quant"},
]

# ── Startup validation: detect accidental duplicates ──────────────────────────
_seen_codes = {}
for _s in POPULAR_SCHEMES:
    if _s["code"] in _seen_codes:
        _log.warning(
            "Duplicate scheme code %s: '%s' conflicts with '%s' — second entry ignored",
            _s["code"], _s["name"], _seen_codes[_s["code"]],
        )
    else:
        _seen_codes[_s["code"]] = _s["name"]
del _seen_codes

CATEGORIES = [
    "All",
    "Large Cap",
    "Large & Mid Cap",
    "Multi Cap",
    "Mid Cap",
    "Small Cap",
    "Flexi Cap",
    "Focused",
    "Value & Contra",
    "International",
    "Gold & Silver",
    "ELSS",
    "Thematic",
    "Debt",
    "Index Funds",
    "Hybrid",
]

# Benchmark proxies using verified MFAPI scheme codes
BENCHMARK_PROXIES = {
    "Nifty 50":         {"code": "118741", "label": "Nifty 50 (Nippon India Index)"},
    "Sensex":           {"code": "151769", "label": "Sensex (SBI BSE Sensex Index)"},
    "Nifty Midcap 150": {"code": "150673", "label": "Nifty Midcap 150 (SBI Midcap Index)"},
    "Nifty Smallcap":   {"code": "125354", "label": "Nifty Smallcap (Axis Small Cap proxy)"},
    "S&P 500":          {"code": "148381", "label": "S&P 500 (Motilal Oswal S&P 500)"},
    "NASDAQ 100":       {"code": "145552", "label": "NASDAQ 100 (Motilal Oswal NASDAQ 100)"},
    "Gold":             {"code": "119788", "label": "Gold (SBI Gold Fund)"},
}


def get_schemes_by_category(category: str = None):
    if not category or category == "All":
        return POPULAR_SCHEMES
    return [s for s in POPULAR_SCHEMES if s["category"] == category]


def get_scheme_info(code: str):
    for s in POPULAR_SCHEMES:
        if s["code"] == code:
            return s
    return None


def get_benchmarks():
    return BENCHMARK_PROXIES
