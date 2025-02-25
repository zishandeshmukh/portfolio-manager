from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
import numpy as np
import pandas as pd
from models.portfolio_optimizer import optimize_portfolio
from models.market_predictor import predict_market_trends
from models.risk_assessor import assess_portfolio_risk
from utils.data_fetcher import fetch_historical_data

app = Flask(__name__)
CORS(app)

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok', 'message': 'AI service is running'}), 200

@app.route('/api/optimize-portfolio', methods=['POST'])
def handle_optimize_portfolio():
    try:
        # Get request data
        data = request.json
        
        if not data or 'assets' not in data:
            return jsonify({'error': 'Missing required data'}), 400
        
        assets = data['assets']
        risk_tolerance = data.get('riskTolerance', 'MODERATE')
        investment_horizon = data.get('investmentHorizon', 5)
        
        # Convert risk tolerance to numerical value for the optimizer
        risk_levels = {
            'CONSERVATIVE': 0.3,
            'MODERATE': 0.5,
            'AGGRESSIVE': 0.8
        }
        risk_factor = risk_levels.get(risk_tolerance, 0.5)
        
        # Extract symbols and current allocations
        symbols = [asset['symbol'] for asset in assets]
        current_allocations = [asset['quantity'] * asset['currentPrice'] for asset in assets]
        total_value = sum(current_allocations)
        
        if total_value <= 0:
            return jsonify({'error': 'Portfolio has no value'}), 400
        
        # Convert to percentage allocations
        current_allocations = [amount / total_value for amount in current_allocations]
        
        # Fetch historical data for the assets
        try:
            historical_data = fetch_historical_data(symbols, days=365)
        except Exception as e:
            return jsonify({'error': f'Error fetching historical data: {str(e)}'}), 500
        
        # Optimize portfolio
        try:
            optimized_weights, expected_return, expected_risk, sharpe_ratio = optimize_portfolio(
                historical_data, 
                risk_factor=risk_factor,
                investment_horizon=investment_horizon
            )
        except Exception as e:
            return jsonify({'error': f'Error optimizing portfolio: {str(e)}'}), 500
        
        # Calculate recommended actions
        recommendations = []
        for i, symbol in enumerate(symbols):
            current_allocation = current_allocations[i]
            target_allocation = optimized_weights[i]
            dollar_value = target_allocation * total_value
            
            # Determine action
            if target_allocation > current_allocation + 0.03:  # 3% threshold for action
                action = 'BUY'
            elif target_allocation < current_allocation - 0.03:
                action = 'SELL'
            else:
                action = 'HOLD'
            
            recommendations.append({
                'symbol': symbol,
                'currentAllocation': current_allocation,
                'targetAllocation': target_allocation,
                'dollarValue': dollar_value,
                'action': action
            })
        
        # Assess overall portfolio risk
        risk_assessment = assess_portfolio_risk(
            historical_data, 
            optimized_weights, 
            risk_tolerance
        )
        
        return jsonify({
            'recommendations': recommendations,
            'portfolioStats': {
                'expectedReturn': expected_return,
                'expectedRisk': expected_risk,
                'sharpeRatio': sharpe_ratio,
                'riskAssessment': risk_assessment
            }
        }), 200
    
    except Exception as e:
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/api/predict-market', methods=['POST'])
def handle_predict_market():
    try:
        # Get request data
        data = request.json
        
        if not data or 'symbols' not in data:
            return jsonify({'error': 'Missing required data'}), 400
        
        symbols = data['symbols']
        days = data.get('days', 30)  # Default prediction horizon
        
        # Fetch historical data
        try:
            historical_data = fetch_historical_data(symbols, days=max(365, days*2))
        except Exception as e:
            return jsonify({'error': f'Error fetching historical data: {str(e)}'}), 500
        
        # Generate predictions
        try:
            predictions = predict_market_trends(historical_data, days=days)
        except Exception as e:
            return jsonify({'error': f'Error generating predictions: {str(e)}'}), 500
        
        return jsonify({'predictions': predictions}), 200
    
    except Exception as e:
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/api/assess-risk', methods=['POST'])
def handle_assess_risk():
    try:
        # Get request data
        data = request.json
        
        if not data or 'assets' not in data:
            return jsonify({'error': 'Missing required data'}), 400
        
        assets = data['assets']
        risk_tolerance = data.get('riskTolerance', 'MODERATE')
        
        # Extract symbols and allocations
        symbols = [asset['symbol'] for asset in assets]
        allocations = [asset['quantity'] * asset['currentPrice'] for asset in assets]
        total_value = sum(allocations)
        
        if total_value <= 0:
            return jsonify({'error': 'Portfolio has no value'}), 400
        
        # Convert to percentage allocations
        allocations = [amount / total_value for amount in allocations]
        
        # Fetch historical data
        try:
            historical_data = fetch_historical_data(symbols, days=365)
        except Exception as e:
            return jsonify({'error': f'Error fetching historical