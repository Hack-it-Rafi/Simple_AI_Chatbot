def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

def main():
    n = 10
    result = fibonacci(n)
    print(f"Fibonacci of {n} is {result}")

if __name__ == "__main__":
    main()