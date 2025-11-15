#!/usr/bin/env python3
"""
CodeBLEU Evaluator for AI Code Generation
==========================================

This module implements CodeBLEU metric for evaluating the quality of generated code
from the AI chatbot server. CodeBLEU combines traditional BLEU scores with 
code-specific metrics including syntactic matching and semantic similarity.

CodeBLEU = α * BLEU + β * BLEU_weight + γ * Match_ast + δ * Match_cf

Where:
- BLEU: Traditional BLEU score on tokens
- BLEU_weight: Weighted BLEU considering keyword importance  
- Match_ast: Abstract Syntax Tree matching score
- Match_cf: Control flow matching score
"""

import os
import json
import ast
import re
import sys
import argparse
import logging
from typing import List, Dict, Tuple, Optional, Union, Any
from collections import Counter, defaultdict
from datetime import datetime
import math

try:
    import tree_sitter
    from tree_sitter import Language, Parser
except ImportError:
    print("Warning: tree-sitter not available. AST analysis will use Python's ast module only.")
    tree_sitter = None

try:
    import requests
except ImportError:
    print("Warning: requests not available. API integration disabled.")
    requests = None

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class CodeBLEUEvaluator:
    """
    Main class for evaluating code generation quality using CodeBLEU metric.
    """
    
    def __init__(self, alpha: float = 0.25, beta: float = 0.25, gamma: float = 0.25, delta: float = 0.25):
        """
        Initialize CodeBLEU evaluator with weight parameters.
        
        Args:
            alpha: Weight for traditional BLEU score
            beta: Weight for weighted BLEU score  
            gamma: Weight for AST matching score
            delta: Weight for control flow matching score
        """
        if not math.isclose(alpha + beta + gamma + delta, 1.0, rel_tol=1e-9):
            raise ValueError("Weights must sum to 1.0")
            
        self.alpha = alpha
        self.beta = beta
        self.gamma = gamma
        self.delta = delta
        
        # Language-specific keywords for weighted BLEU
        self.keywords = {
            'python': {
                'def', 'class', 'if', 'else', 'elif', 'for', 'while', 'try', 'except', 
                'finally', 'with', 'import', 'from', 'return', 'yield', 'lambda', 
                'and', 'or', 'not', 'in', 'is', 'global', 'nonlocal', 'assert',
                'break', 'continue', 'pass', 'raise', 'del', 'True', 'False', 'None'
            },
            'javascript': {
                'function', 'var', 'let', 'const', 'if', 'else', 'for', 'while', 'do',
                'switch', 'case', 'default', 'break', 'continue', 'return', 'try', 'catch',
                'finally', 'throw', 'new', 'this', 'typeof', 'instanceof', 'in', 'of',
                'true', 'false', 'null', 'undefined', 'class', 'extends', 'super',
                'static', 'async', 'await', 'yield', 'import', 'export', 'from'
            },
            'java': {
                'class', 'interface', 'enum', 'public', 'private', 'protected', 'static',
                'final', 'abstract', 'synchronized', 'volatile', 'transient', 'native',
                'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default',
                'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw',
                'throws', 'new', 'this', 'super', 'instanceof', 'true', 'false', 'null'
            }
        }
        
        logger.info(f"CodeBLEU evaluator initialized with weights: α={alpha}, β={beta}, γ={gamma}, δ={delta}")
    
    def tokenize_code(self, code: str, language: str = 'python') -> List[str]:
        """
        Tokenize code into meaningful tokens for comparison.
        
        Args:
            code: Source code string
            language: Programming language
            
        Returns:
            List of tokens
        """
        # Remove comments and normalize whitespace
        if language == 'python':
            # Remove Python comments
            code = re.sub(r'#.*$', '', code, flags=re.MULTILINE)
        elif language in ['javascript', 'java']:
            # Remove single-line and multi-line comments
            code = re.sub(r'//.*$', '', code, flags=re.MULTILINE)
            code = re.sub(r'/\*.*?\*/', '', code, flags=re.DOTALL)
        
        # Tokenize on word boundaries, operators, and punctuation
        tokens = re.findall(r'\b\w+\b|[^\w\s]', code.lower())
        
        # Filter out empty tokens
        return [token for token in tokens if token.strip()]
    
    def calculate_bleu_score(self, candidate: List[str], references: List[List[str]], 
                           max_n: int = 4) -> float:
        """
        Calculate traditional BLEU score with n-gram precision.
        
        Args:
            candidate: Tokenized candidate (generated code)
            references: List of tokenized reference codes
            max_n: Maximum n-gram order
            
        Returns:
            BLEU score between 0 and 1
        """
        if not candidate or not references:
            return 0.0
            
        # Calculate n-gram precisions
        precisions = []
        
        for n in range(1, max_n + 1):
            candidate_ngrams = self._get_ngrams(candidate, n)
            reference_ngrams = [self._get_ngrams(ref, n) for ref in references]
            
            if not candidate_ngrams:
                precisions.append(0.0)
                continue
            
            # Count maximum occurrences in any reference
            max_counts = defaultdict(int)
            for ref_ngrams in reference_ngrams:
                for ngram, count in ref_ngrams.items():
                    max_counts[ngram] = max(max_counts[ngram], count)
            
            # Calculate precision
            correct = 0
            total = sum(candidate_ngrams.values())
            
            for ngram, count in candidate_ngrams.items():
                correct += min(count, max_counts[ngram])
            
            precision = correct / total if total > 0 else 0.0
            precisions.append(precision)
        
        # Calculate brevity penalty
        candidate_length = len(candidate)
        closest_ref_length = min(references, key=lambda ref: abs(len(ref) - candidate_length))
        reference_length = len(closest_ref_length)
        
        if candidate_length > reference_length:
            brevity_penalty = 1.0
        else:
            brevity_penalty = math.exp(1 - reference_length / candidate_length) if candidate_length > 0 else 0.0
        
        # Calculate geometric mean of precisions
        if any(p == 0 for p in precisions):
            return 0.0
        
        log_precision_sum = sum(math.log(p) for p in precisions)
        geo_mean = math.exp(log_precision_sum / len(precisions))
        
        return brevity_penalty * geo_mean
    
    def calculate_weighted_bleu_score(self, candidate: List[str], references: List[List[str]], 
                                    language: str = 'python') -> float:
        """
        Calculate weighted BLEU score giving more importance to keywords.
        
        Args:
            candidate: Tokenized candidate
            references: List of tokenized references
            language: Programming language for keyword detection
            
        Returns:
            Weighted BLEU score between 0 and 1
        """
        keywords = self.keywords.get(language, set())
        
        # Create weighted versions of tokens
        def weight_tokens(tokens: List[str]) -> List[str]:
            weighted = []
            for token in tokens:
                if token in keywords:
                    # Give keywords double weight by duplicating them
                    weighted.extend([token, token])
                else:
                    weighted.append(token)
            return weighted
        
        weighted_candidate = weight_tokens(candidate)
        weighted_references = [weight_tokens(ref) for ref in references]
        
        return self.calculate_bleu_score(weighted_candidate, weighted_references)
    
    def calculate_ast_matching_score(self, candidate_code: str, reference_codes: List[str],
                                   language: str = 'python') -> float:
        """
        Calculate Abstract Syntax Tree matching score.
        
        Args:
            candidate_code: Generated code string
            reference_codes: List of reference code strings
            language: Programming language
            
        Returns:
            AST matching score between 0 and 1
        """
        if language == 'python':
            return self._calculate_python_ast_score(candidate_code, reference_codes)
        else:
            # For non-Python languages, use structural similarity based on patterns
            return self._calculate_structural_similarity(candidate_code, reference_codes, language)
    
    def _calculate_python_ast_score(self, candidate_code: str, reference_codes: List[str]) -> float:
        """Calculate AST matching score for Python code."""
        try:
            candidate_ast = ast.parse(candidate_code)
            candidate_nodes = self._extract_ast_nodes(candidate_ast)
        except SyntaxError:
            logger.warning("Candidate code has syntax errors, AST score will be 0")
            return 0.0
        
        max_score = 0.0
        
        for ref_code in reference_codes:
            try:
                ref_ast = ast.parse(ref_code)
                ref_nodes = self._extract_ast_nodes(ref_ast)
                
                # Calculate similarity based on common AST node types
                if not candidate_nodes and not ref_nodes:
                    score = 1.0
                elif not candidate_nodes or not ref_nodes:
                    score = 0.0
                else:
                    common_nodes = len(set(candidate_nodes) & set(ref_nodes))
                    total_nodes = len(set(candidate_nodes) | set(ref_nodes))
                    score = common_nodes / total_nodes if total_nodes > 0 else 0.0
                
                max_score = max(max_score, score)
                
            except SyntaxError:
                logger.warning("Reference code has syntax errors, skipping")
                continue
        
        return max_score
    
    def _extract_ast_nodes(self, tree: ast.AST) -> List[str]:
        """Extract AST node types from parsed tree."""
        nodes = []
        
        for node in ast.walk(tree):
            nodes.append(type(node).__name__)
        
        return nodes
    
    def _calculate_structural_similarity(self, candidate: str, references: List[str], 
                                       language: str) -> float:
        """Calculate structural similarity for non-Python languages."""
        # Extract structural patterns (functions, classes, control structures)
        candidate_structures = self._extract_code_structures(candidate, language)
        
        max_score = 0.0
        
        for ref in references:
            ref_structures = self._extract_code_structures(ref, language)
            
            if not candidate_structures and not ref_structures:
                score = 1.0
            elif not candidate_structures or not ref_structures:
                score = 0.0
            else:
                common = len(set(candidate_structures) & set(ref_structures))
                total = len(set(candidate_structures) | set(ref_structures))
                score = common / total if total > 0 else 0.0
            
            max_score = max(max_score, score)
        
        return max_score
    
    def _extract_code_structures(self, code: str, language: str) -> List[str]:
        """Extract code structures like functions, classes, etc."""
        structures = []
        
        if language == 'javascript':
            # Extract JavaScript structures
            structures.extend(re.findall(r'function\s+(\w+)', code))
            structures.extend(re.findall(r'class\s+(\w+)', code))
            structures.extend(re.findall(r'(\w+)\s*:\s*function', code))
            structures.extend(re.findall(r'const\s+(\w+)\s*=\s*\([^)]*\)\s*=>', code))
        
        elif language == 'java':
            # Extract Java structures
            structures.extend(re.findall(r'class\s+(\w+)', code))
            structures.extend(re.findall(r'interface\s+(\w+)', code))
            structures.extend(re.findall(r'public\s+\w+\s+(\w+)\s*\(', code))
            structures.extend(re.findall(r'private\s+\w+\s+(\w+)\s*\(', code))
        
        return structures
    
    def calculate_control_flow_score(self, candidate_code: str, reference_codes: List[str],
                                   language: str = 'python') -> float:
        """
        Calculate control flow matching score.
        
        Args:
            candidate_code: Generated code string
            reference_codes: List of reference code strings  
            language: Programming language
            
        Returns:
            Control flow matching score between 0 and 1
        """
        candidate_cf = self._extract_control_flow(candidate_code, language)
        
        max_score = 0.0
        
        for ref_code in reference_codes:
            ref_cf = self._extract_control_flow(ref_code, language)
            
            if not candidate_cf and not ref_cf:
                score = 1.0
            elif not candidate_cf or not ref_cf:
                score = 0.0
            else:
                # Calculate similarity of control flow patterns
                common = len(set(candidate_cf) & set(ref_cf))
                total = len(set(candidate_cf) | set(ref_cf))
                score = common / total if total > 0 else 0.0
            
            max_score = max(max_score, score)
        
        return max_score
    
    def _extract_control_flow(self, code: str, language: str) -> List[str]:
        """Extract control flow constructs from code."""
        control_flow = []
        
        # Common control flow patterns across languages
        patterns = [
            r'\bif\s*\(',
            r'\belse\b',
            r'\belif\s*\(',
            r'\bfor\s*\(',
            r'\bwhile\s*\(',
            r'\btry\b',
            r'\bcatch\b',
            r'\bfinally\b',
            r'\bswitch\s*\(',
            r'\bcase\s+',
            r'\bbreak\b',
            r'\bcontinue\b',
            r'\breturn\b'
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, code, re.IGNORECASE)
            control_flow.extend(matches)
        
        return control_flow
    
    def _get_ngrams(self, tokens: List[str], n: int) -> Counter:
        """Generate n-grams from token list."""
        ngrams = []
        for i in range(len(tokens) - n + 1):
            ngram = tuple(tokens[i:i + n])
            ngrams.append(ngram)
        return Counter(ngrams)
    
    def detect_language(self, code: str) -> str:
        """
        Detect programming language from code content.
        
        Args:
            code: Source code string
            
        Returns:
            Detected language name
        """
        code_lower = code.lower()
        
        # Python indicators
        if any(indicator in code for indicator in ['def ', 'import ', 'from ', '__init__', 'self.']):
            return 'python'
        
        # JavaScript indicators  
        elif any(indicator in code for indicator in ['function ', 'var ', 'let ', 'const ', '=>']):
            return 'javascript'
        
        # Java indicators
        elif any(indicator in code for indicator in ['public class', 'private ', 'public static void']):
            return 'java'
        
        # Default to Python
        return 'python'
    
    def evaluate(self, candidate_code: str, reference_codes: Union[str, List[str]], 
                language: Optional[str] = None) -> Dict[str, float]:
        """
        Evaluate generated code using CodeBLEU metric.
        
        Args:
            candidate_code: Generated code to evaluate
            reference_codes: Reference code(s) for comparison
            language: Programming language (auto-detected if None)
            
        Returns:
            Dictionary containing all scores and final CodeBLEU score
        """
        # Ensure reference_codes is a list
        if isinstance(reference_codes, str):
            reference_codes = [reference_codes]
        
        # Auto-detect language if not provided
        if language is None:
            language = self.detect_language(candidate_code)
        
        logger.info(f"Evaluating code with language: {language}")
        
        # Tokenize code
        candidate_tokens = self.tokenize_code(candidate_code, language)
        reference_tokens_list = [self.tokenize_code(ref, language) for ref in reference_codes]
        
        # Calculate individual scores
        bleu_score = self.calculate_bleu_score(candidate_tokens, reference_tokens_list)
        weighted_bleu_score = self.calculate_weighted_bleu_score(candidate_tokens, reference_tokens_list, language)
        ast_score = self.calculate_ast_matching_score(candidate_code, reference_codes, language)
        cf_score = self.calculate_control_flow_score(candidate_code, reference_codes, language)
        
        # Calculate final CodeBLEU score
        codebleu_score = (
            self.alpha * bleu_score +
            self.beta * weighted_bleu_score + 
            self.gamma * ast_score +
            self.delta * cf_score
        )
        
        results = {
            'codebleu': codebleu_score,
            'bleu': bleu_score,
            'weighted_bleu': weighted_bleu_score,
            'ast_match': ast_score,
            'control_flow': cf_score,
            'language': language,
            'weights': {
                'alpha': self.alpha,
                'beta': self.beta, 
                'gamma': self.gamma,
                'delta': self.delta
            }
        }
        
        logger.info(f"Evaluation results: CodeBLEU={codebleu_score:.3f}")
        return results


class CodeBLEUDatasetEvaluator:
    """
    Evaluate CodeBLEU scores on a dataset of code pairs.
    """
    
    def __init__(self, evaluator: CodeBLEUEvaluator):
        self.evaluator = evaluator
        self.results = []
    
    def load_dataset_from_files(self, generated_dir: str, reference_dir: str) -> List[Tuple[str, str]]:
        """
        Load dataset from directories containing generated and reference code files.
        
        Args:
            generated_dir: Directory with generated code files
            reference_dir: Directory with reference code files
            
        Returns:
            List of (generated_code, reference_code) tuples
        """
        dataset = []
        
        if not os.path.exists(generated_dir) or not os.path.exists(reference_dir):
            logger.error(f"Directory not found: {generated_dir} or {reference_dir}")
            return dataset
        
        generated_files = sorted(os.listdir(generated_dir))
        reference_files = sorted(os.listdir(reference_dir))
        
        for gen_file, ref_file in zip(generated_files, reference_files):
            gen_path = os.path.join(generated_dir, gen_file)
            ref_path = os.path.join(reference_dir, ref_file)
            
            if os.path.isfile(gen_path) and os.path.isfile(ref_path):
                try:
                    with open(gen_path, 'r', encoding='utf-8') as f:
                        generated_code = f.read()
                    with open(ref_path, 'r', encoding='utf-8') as f:
                        reference_code = f.read()
                    
                    dataset.append((generated_code, reference_code))
                except Exception as e:
                    logger.warning(f"Error reading files {gen_file}, {ref_file}: {e}")
        
        logger.info(f"Loaded {len(dataset)} code pairs from dataset")
        return dataset
    
    def evaluate_dataset(self, dataset: List[Tuple[str, str]]) -> Dict[str, Any]:
        """
        Evaluate CodeBLEU scores on entire dataset.
        
        Args:
            dataset: List of (generated_code, reference_code) tuples
            
        Returns:
            Dictionary with aggregated results
        """
        if not dataset:
            logger.error("Empty dataset provided")
            return {}
        
        individual_scores = []
        
        for i, (generated, reference) in enumerate(dataset):
            logger.info(f"Evaluating pair {i+1}/{len(dataset)}")
            
            try:
                scores = self.evaluator.evaluate(generated, reference)
                individual_scores.append(scores)
                self.results.append({
                    'index': i,
                    'scores': scores,
                    'generated_code': generated,
                    'reference_code': reference
                })
            except Exception as e:
                logger.error(f"Error evaluating pair {i}: {e}")
                continue
        
        if not individual_scores:
            logger.error("No valid evaluations completed")
            return {}
        
        # Calculate aggregate statistics
        metrics = ['codebleu', 'bleu', 'weighted_bleu', 'ast_match', 'control_flow']
        aggregated = {}
        
        for metric in metrics:
            values = [scores[metric] for scores in individual_scores]
            aggregated[metric] = {
                'mean': sum(values) / len(values),
                'max': max(values),
                'min': min(values),
                'std': (sum((x - sum(values)/len(values))**2 for x in values) / len(values))**0.5
            }
        
        aggregated['total_pairs'] = len(individual_scores)
        aggregated['evaluation_time'] = datetime.now().isoformat()
        
        logger.info(f"Dataset evaluation completed. Mean CodeBLEU: {aggregated['codebleu']['mean']:.3f}")
        return aggregated
    
    def save_results(self, filepath: str):
        """Save evaluation results to JSON file."""
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(self.results, f, indent=2, ensure_ascii=False)
            logger.info(f"Results saved to {filepath}")
        except Exception as e:
            logger.error(f"Error saving results: {e}")


class ChatbotCodeEvaluator:
    """
    Evaluate code generated by the chatbot server using CodeBLEU.
    """
    
    def __init__(self, server_url: str = "http://localhost:3000", evaluator: CodeBLEUEvaluator = None):
        self.server_url = server_url.rstrip('/')
        self.evaluator = evaluator or CodeBLEUEvaluator()
        self.session_id = f"eval_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    def generate_code_from_prompt(self, prompt: str) -> Optional[str]:
        """
        Generate code using the chatbot server.
        
        Args:
            prompt: Code generation prompt
            
        Returns:
            Generated code or None if failed
        """
        if not requests:
            logger.error("requests library not available for API calls")
            return None
        
        try:
            response = requests.post(
                f"{self.server_url}/api/chat",
                json={
                    "message": prompt,
                    "sessionId": self.session_id
                },
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                return data.get('response', '')
            else:
                logger.error(f"Server error: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"Error calling chatbot API: {e}")
            return None
    
    def evaluate_prompt_with_reference(self, prompt: str, reference_code: str) -> Optional[Dict[str, float]]:
        """
        Generate code from prompt and evaluate against reference.
        
        Args:
            prompt: Code generation prompt
            reference_code: Reference implementation
            
        Returns:
            Evaluation results or None if failed
        """
        generated_code = self.generate_code_from_prompt(prompt)
        
        if generated_code is None:
            logger.error("Failed to generate code from chatbot")
            return None
        
        # Extract actual code from response (remove markdown formatting)
        code_match = re.search(r'```(?:\w+)?\n(.*?)```', generated_code, re.DOTALL)
        if code_match:
            generated_code = code_match.group(1).strip()
        
        return self.evaluator.evaluate(generated_code, reference_code)


def main():
    """Main function for command-line usage."""
    parser = argparse.ArgumentParser(description="CodeBLEU Evaluator for Code Generation")
    parser.add_argument("--candidate", type=str, help="Path to generated code file")
    parser.add_argument("--reference", type=str, help="Path to reference code file")
    parser.add_argument("--generated-dir", type=str, help="Directory with generated code files")
    parser.add_argument("--reference-dir", type=str, help="Directory with reference code files")
    parser.add_argument("--prompt", type=str, help="Prompt to test with chatbot")
    parser.add_argument("--server-url", type=str, default="http://localhost:3000", help="Chatbot server URL")
    parser.add_argument("--output", type=str, help="Output file for results")
    parser.add_argument("--language", type=str, choices=['python', 'javascript', 'java'], help="Programming language")
    parser.add_argument("--alpha", type=float, default=0.25, help="Weight for BLEU score")
    parser.add_argument("--beta", type=float, default=0.25, help="Weight for weighted BLEU score")
    parser.add_argument("--gamma", type=float, default=0.25, help="Weight for AST matching")
    parser.add_argument("--delta", type=float, default=0.25, help="Weight for control flow matching")
    
    args = parser.parse_args()
    
    # Initialize evaluator
    evaluator = CodeBLEUEvaluator(args.alpha, args.beta, args.gamma, args.delta)
    
    # Single file evaluation
    if args.candidate and args.reference:
        try:
            with open(args.candidate, 'r', encoding='utf-8') as f:
                candidate_code = f.read()
            with open(args.reference, 'r', encoding='utf-8') as f:
                reference_code = f.read()
            
            results = evaluator.evaluate(candidate_code, reference_code, args.language)
            
            print(f"CodeBLEU Evaluation Results:")
            print(f"CodeBLEU Score: {results['codebleu']:.4f}")
            print(f"BLEU Score: {results['bleu']:.4f}")
            print(f"Weighted BLEU: {results['weighted_bleu']:.4f}")
            print(f"AST Matching: {results['ast_match']:.4f}")
            print(f"Control Flow: {results['control_flow']:.4f}")
            print(f"Language: {results['language']}")
            
            if args.output:
                with open(args.output, 'w') as f:
                    json.dump(results, f, indent=2)
                print(f"Results saved to {args.output}")
                
        except Exception as e:
            logger.error(f"Error in single file evaluation: {e}")
            return 1
    
    # Dataset evaluation
    elif args.generated_dir and args.reference_dir:
        dataset_evaluator = CodeBLEUDatasetEvaluator(evaluator)
        dataset = dataset_evaluator.load_dataset_from_files(args.generated_dir, args.reference_dir)
        
        if dataset:
            results = dataset_evaluator.evaluate_dataset(dataset)
            
            print(f"Dataset Evaluation Results:")
            print(f"Total pairs: {results['total_pairs']}")
            for metric in ['codebleu', 'bleu', 'weighted_bleu', 'ast_match', 'control_flow']:
                stats = results[metric]
                print(f"{metric.upper()}: mean={stats['mean']:.4f}, std={stats['std']:.4f}, min={stats['min']:.4f}, max={stats['max']:.4f}")
            
            if args.output:
                dataset_evaluator.save_results(args.output)
        else:
            logger.error("No dataset found")
            return 1
    
    # Chatbot evaluation
    elif args.prompt:
        chatbot_evaluator = ChatbotCodeEvaluator(args.server_url, evaluator)
        
        if args.reference:
            with open(args.reference, 'r', encoding='utf-8') as f:
                reference_code = f.read()
            
            results = chatbot_evaluator.evaluate_prompt_with_reference(args.prompt, reference_code)
            
            if results:
                print(f"Chatbot Code Evaluation Results:")
                print(f"Prompt: {args.prompt}")
                print(f"CodeBLEU Score: {results['codebleu']:.4f}")
                print(f"BLEU Score: {results['bleu']:.4f}")
                print(f"Weighted BLEU: {results['weighted_bleu']:.4f}")
                print(f"AST Matching: {results['ast_match']:.4f}")
                print(f"Control Flow: {results['control_flow']:.4f}")
                
                if args.output:
                    with open(args.output, 'w') as f:
                        json.dump(results, f, indent=2)
                    print(f"Results saved to {args.output}")
            else:
                logger.error("Chatbot evaluation failed")
                return 1
        else:
            logger.error("Reference code file required for chatbot evaluation")
            return 1
    
    else:
        parser.print_help()
        return 1
    
    return 0


if __name__ == "__main__":
    sys.exit(main())