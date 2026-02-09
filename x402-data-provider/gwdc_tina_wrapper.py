import sys
import os
from datetime import datetime

# Add the gold_analyzer directory to sys.path
script_dir = os.path.dirname(os.path.abspath(__file__))
gold_analyzer_dir = os.path.join(script_dir, "gwdc_tina", "黑客松")
if gold_analyzer_dir not in sys.path:
    sys.path.insert(0, gold_analyzer_dir)

from gold_analyzer.main import run

def main():
    if len(sys.argv) < 2:
        # Default to tomorrow if no date provided
        target_date = (datetime.now()).strftime("%Y-%m-%d")
    else:
        target_date = sys.argv[1]
    
    output_path = "gold_prediction_result.json"
    if len(sys.argv) > 2:
        output_path = sys.argv[2]

    print(f"Running gold prediction for {target_date}...")
    run(target_date=target_date, output_path=output_path)

if __name__ == "__main__":
    main()
