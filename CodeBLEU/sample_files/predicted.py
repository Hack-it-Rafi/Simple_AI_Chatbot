def fib(num):
    if num <= 1:
        return num
    else:
        return fib(num-1) + fib(num-2)

def run_program():
    number = 10
    fib_result = fib(number)
    print("Fibonacci of", number, "is", fib_result)

if __name__ == "__main__":
    run_program()