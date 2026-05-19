import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from routers.analytics import OptimizeRequest, optimize

req = OptimizeRequest(
    funds=[
        {"scheme_code":"118989","investment_amount":50000},
        {"scheme_code":"120716","investment_amount":50000}
    ],
    target="max_sharpe"
)

try:
    print(optimize(req))
except Exception as e:
    import traceback
    traceback.print_exc()
