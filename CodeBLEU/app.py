from flask import Flask, request, render_template, jsonify, flash, redirect, url_for
from flask_cors import CORS
import os
from codebleu import calc_codebleu

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'txt', 'py', 'java', 'cpp', 'c', 'js', 'ts', 'go', 'rb', 'php', 'cs', 'swift', 'kt', 'scala', 'rs'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024 

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    """Check if the uploaded file has an allowed extension"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def default_tokenizer(code):
    """
    Default simple tokenizer - splits code by whitespace and common delimiters
    You can replace this with your custom tokenizer function
    """
    import re
    # Split by whitespace and common programming delimiters
    tokens = re.findall(r'\w+|[^\w\s]', code)
    return tokens

def custom_tokenizer(code):
    """
    Custom tokenizer function - customize this as needed
    This is a placeholder for your custom implementation
    """
    import re
    
    # Remove comments (basic implementation)
    code = re.sub(r'//.*?$|/\*.*?\*/', '', code, flags=re.MULTILINE | re.DOTALL)
    
    # Split into tokens considering programming constructs
    tokens = re.findall(r'\b\w+\b|[{}();,\[\].]|[+\-*/=<>!&|]', code)
    
    # Filter out empty tokens
    tokens = [token.strip() for token in tokens if token.strip()]
    
    return tokens

@app.route('/')
def index():
    """Render the main page"""
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_files():
    """Handle file uploads and calculate CodeBLEU score"""
    try:
        if 'reference_file' not in request.files or 'predicted_file' not in request.files:
            return jsonify({'error': 'Both reference and predicted files are required'}), 400
        
        reference_file = request.files['reference_file']
        predicted_file = request.files['predicted_file']
        use_custom_tokenizer = request.form.get('use_custom_tokenizer') == 'true'
        
        if reference_file.filename == '' or predicted_file.filename == '':
            return jsonify({'error': 'Please select both files'}), 400
        
        if not (allowed_file(reference_file.filename) and allowed_file(predicted_file.filename)):
            return jsonify({'error': 'File type not allowed. Supported types: ' + ', '.join(ALLOWED_EXTENSIONS)}), 400
        
        reference_code = reference_file.read().decode('utf-8')
        predicted_code = predicted_file.read().decode('utf-8')
        
        if use_custom_tokenizer:
            tokenizer = custom_tokenizer
            reference_tokens = tokenizer(reference_code)
            predicted_tokens = tokenizer(predicted_code)
            reference_processed = ' '.join(reference_tokens)
            predicted_processed = ' '.join(predicted_tokens)
        else:
            reference_processed = reference_code
            predicted_processed = predicted_code
        
        references = [[reference_processed]]  
        predictions = [predicted_processed]   
        
        result = calc_codebleu(
            references=references,
            predictions=predictions,
            lang="python",
            weights=(0.25, 0.25, 0.25, 0.25)
        )
        
        if isinstance(result, dict):
            main_score = result.get('codebleu', 0.0)
        else:
            main_score = float(result)
        
        response = {
            'success': True,
            'codebleu_score': main_score,
            'reference_length': len(reference_code),
            'predicted_length': len(predicted_code),
            'tokenizer_used': 'custom' if use_custom_tokenizer else 'default',
            'detailed_scores': result if isinstance(result, dict) else {'codebleu': main_score}
        }
        
        return jsonify(response)
        
    except Exception as e:
        return jsonify({'error': f'An error occurred: {str(e)}'}), 500

@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({'status': 'healthy'})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)