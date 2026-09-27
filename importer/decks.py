"""Starter decks (approved before they went in).

Quant facts: a prompt and its answer. Method: one step and what to do at that step.
Numeric answers are computed here, not typed, so they can't carry a typo.
"""
from fractions import Fraction
from math import comb, factorial


def pct(fr: Fraction) -> str:
    v = fr * 100
    if v.denominator == 1:
        return f"{v.numerator}%"
    whole, rem = divmod(v.numerator, v.denominator)
    dec = float(v)
    exact = f"{dec:.4f}".rstrip("0").rstrip(".")
    if len(exact.split(".")[-1]) <= 3:
        return f"{exact}%"
    return f"{whole} {Fraction(rem, v.denominator)}% (≈ {dec:.1f}%)"


def dec(fr: Fraction) -> str:
    d = float(fr)
    s = f"{d:.4f}".rstrip("0")
    return s if len(s.split(".")[-1]) < 4 else f"≈ {d:.3f}"


def quant_facts():
    c = []
    add = lambda topic, front, back: c.append({"topic": topic, "front": front, "back": back})
    for n in range(11, 31):
        add("squares", f"{n}²", str(n * n))
    for n in range(3, 13):
        add("cubes", f"{n}³", str(n ** 3))
    for b, es in ((2, range(5, 11)), (3, (4, 5)), (5, (3, 4))):
        for e in es:
            add("powers", f"{b}^{e}", str(b ** e))
    add("roots", "√2 (to two decimals)", "≈ 1.41")
    add("roots", "√3 (to two decimals)", "≈ 1.73")
    add("roots", "√5 (to two decimals)", "≈ 2.24")
    for a, b in ((1, 3), (2, 3), (1, 6), (5, 6), (1, 7), (1, 8), (3, 8), (5, 8), (7, 8), (1, 9), (2, 9),
                 (1, 11), (1, 12), (5, 12), (1, 16), (3, 16), (1, 15), (1, 40)):
        fr = Fraction(a, b)
        add("fractions", f"{a}/{b} as a % and a decimal", f"{pct(fr)} = {dec(fr)}")
    for p, fr in (("12.5%", "1/8"), ("37.5%", "3/8"), ("62.5%", "5/8"), ("87.5%", "7/8"),
                  ("16⅔%", "1/6"), ("83⅓%", "5/6"), ("0.0625", "1/16")):
        add("fractions", f"{p} as a fraction", fr)
    add("primes", "The primes below 50", "2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47")
    for n, f in ((91, "7 × 13"), (51, "3 × 17"), (87, "3 × 29"), (119, "7 × 17"), (57, "3 × 19")):
        add("primes", f"Is {n} prime?", f"No: {n} = {f}")
    add("primes", "The even prime", "2")
    add("primes", "Is 1 prime?", "No. The smallest prime is 2.")
    for d, rule in ((3, "the sum of the digits is divisible by 3"), (4, "the last two digits form a number divisible by 4"),
                    (6, "it is divisible by both 2 and 3"), (8, "the last three digits form a number divisible by 8"),
                    (9, "the sum of the digits is divisible by 9"),
                    (11, "the alternating sum of the digits (+ − + …) is divisible by 11"),
                    (12, "it is divisible by both 3 and 4")):
        add("divisibility", f"A number is divisible by {d} when…", rule)
    add("factors", "Number of positive factors of 2^a · 3^b · 5^c", "(a+1)(b+1)(c+1)")
    add("factors", "How many positive factors does 72 have?", "12  (72 = 2³ · 3², so 4 × 3)")
    for front, back in (("a^m · a^n", "a^(m+n)"), ("a^m ÷ a^n", "a^(m−n)"), ("(a^m)^n", "a^(mn)"),
                        ("a^(−n)", "1 / a^n"), ("a^0 (a ≠ 0)", "1"), ("a^(1/2)", "√a"), ("(ab)^n", "a^n · b^n"),
                        ("2^10 is about…", "1,000 (it's 1,024)"), ("x² = x means x is…", "0 or 1"),
                        ("If 0 < x < 1, how do x² and x compare?", "x² < x")):
        add("exponents", front, back)
    for front, back in (("√(ab)", "√a · √b (for a, b ≥ 0)"), ("Is √a + √b = √(a+b)?", "No (√9 + √16 = 7, √25 = 5)"),
                        ("1/√2 without a root below", "√2 / 2"), ("√(x²)", "|x|")):
        add("roots", front, back)
    for front, back in (("(a + b)²", "a² + 2ab + b²"), ("(a − b)²", "a² − 2ab + b²"), ("a² − b²", "(a + b)(a − b)"),
                        ("For ax² + bx + c = 0: sum of the roots", "−b/a"),
                        ("For ax² + bx + c = 0: product of the roots", "c/a"),
                        ("When does ax² + bx + c = 0 have two real roots?", "When b² − 4ac > 0"),
                        ("Factor x² − 5x + 6", "(x − 2)(x − 3)")):
        add("algebra", front, back)
    for front, back in (("odd + odd", "even"), ("odd × even", "even"), ("odd × odd", "odd"),
                        ("even^n (n a positive integer)", "even"), ("Is 0 even?", "Yes. It is also neither positive nor negative."),
                        ("Is 0 positive?", "No, and not negative either"),
                        ("The product of n consecutive integers is always divisible by…", "n!")):
        add("number properties", front, back)
    for front, back in (("x divided by d gives quotient q and remainder r. So x = …", "qd + r, with 0 ≤ r < d"),
                        ("Units digits of powers of 2 repeat as…", "2, 4, 8, 6"),
                        ("Units digits of powers of 3 repeat as…", "3, 9, 7, 1"),
                        ("Units digits of powers of 7 repeat as…", "7, 9, 3, 1")):
        add("remainders", front, back)
    for front, back in (("Percent change", "(new − old) / old × 100"),
                        ("Up 20%, then down 20%: net change?", "Down 4%  (1.2 × 0.8 = 0.96)"),
                        ("x% of y equals…", "y% of x"),
                        ("Up 25%, then down 20%: net change?", "None  (1.25 × 0.8 = 1)"),
                        ("A price rises by p%. Multiply the old price by…", "(1 + p/100)")):
        add("percents", front, back)
    for front, back in (("Ratio a : b = 2 : 3. What fraction of the total is a?", "2/5"),
                        ("Ratio 2 : 3 and the total is 40. The parts are…", "16 and 24")):
        add("ratios", front, back)
    for front, back in (("Distance, rate, time", "D = R × T"),
                        ("A does a job in a hours, B in b hours. Together, per hour…", "1/a + 1/b of the job"),
                        ("Average speed over two equal distances at speeds a and b", "2ab / (a + b)"),
                        ("Two objects move towards each other: their closing speed is…", "the sum of their speeds")):
        add("rates", front, back)
    add("interest", "Simple interest on P at r% for t years", "P × r/100 × t")
    add("interest", "Compound interest: P at r% a year for t years grows to…", "P(1 + r/100)^t")
    for front, back in (("Mean", "sum ÷ number of values"),
                        ("Median of an even number of values", "the mean of the two middle values"),
                        ("Range", "largest − smallest"),
                        ("Add 5 to every value: what happens to the standard deviation?", "Nothing"),
                        ("Multiply every value by 3: the standard deviation…", "is multiplied by 3"),
                        ("When is the standard deviation 0?", "When all the values are equal"),
                        ("In an evenly spaced set, mean vs median", "They're equal"),
                        ("Weighted average of groups", "Σ(group mean × group size) ÷ total size")):
        add("statistics", front, back)
    for n in (5, 6):
        add("counting", f"{n}!", str(factorial(n)))
    for n, k in ((5, 2), (6, 3), (6, 2)):
        add("counting", f"{n}C{k} (choose {k} from {n})", str(comb(n, k)))
    for front, back in (("nCr", "n! / (r!(n − r)!)"), ("nPr (order matters)", "n! / (n − r)!"),
                        ("Arrangements of the letters of LEVEL", f"{factorial(5) // (factorial(2) * factorial(2))}  (5! / (2! 2!))"),
                        ("P(A or B)", "P(A) + P(B) − P(A and B)"), ("P(not A)", "1 − P(A)"),
                        ("P(A and B) when A and B are independent", "P(A) × P(B)"),
                        ("P(at least one)", "1 − P(none)")):
        add("counting & probability", front, back)
    for front, back in (("nth term of an arithmetic sequence", "a₁ + (n − 1)d"),
                        ("Sum of an arithmetic sequence", "(first + last) ÷ 2 × number of terms"),
                        ("1 + 2 + … + n", "n(n + 1) / 2"), ("Sum of the first n odd numbers", "n²"),
                        ("How many integers from a to b, inclusive?", "b − a + 1")):
        add("sequences", front, back)
    for front, back in (("Multiplying an inequality by a negative number…", "flips the sign"),
                        ("|x| < a (a > 0) means…", "−a < x < a"), ("|x| > a (a > 0) means…", "x > a or x < −a"),
                        ("Can you square both sides of x < y safely?", "Yes, when both sides are non-negative; otherwise not always")):
        add("inequalities", front, back)
    for front, back in (("|x − a| is…", "the distance between x and a on the number line"),
                        ("|a + b| compared with |a| + |b|", "|a + b| ≤ |a| + |b|"), ("|x| = √(…)", "x²")):
        add("absolute value", front, back)
    for i, card in enumerate(c, 1):
        card["id"] = f"qf{i:03d}"
        card["deck"] = "quant facts"
    return c


METHOD = [
    ("RC — before the questions", "In one line: what is it arguing, and where does the author stand?"),
    ("RC — while reading", "Read for the structure: what each paragraph does, not every detail. Note where the author's own view shows."),
    ("RC — main idea question", "Pick the answer that covers the whole passage, not one paragraph of it."),
    ("RC — detail question", "Go back and find the line. The right answer says the same thing in other words."),
    ("RC — inference question", "The right answer is true from the passage alone, with no extra step."),
    ("RC — wrong-answer patterns", "Too strong, out of scope, half right, right words with the wrong meaning."),
    ("CR — first read", "Find the conclusion and the reason for it. Say the argument in your own words."),
    ("CR — before the choices", "Name the gap between the evidence and the conclusion."),
    ("CR — strengthen or weaken", "The right answer hits the gap you named, not just the topic."),
    ("CR — assumption", "Negate the choice. If the argument falls apart, that's the assumption."),
    ("CR — wrong-answer patterns", "Out of scope, reversed logic, or it strengthens when you were asked to weaken."),
    ("DS — the five answers", "A: (1) alone. B: (2) alone. C: both together, neither alone. D: each alone. E: not even together."),
    ("DS — before the statements", "Know what would answer the question. Rewrite it in its simplest form."),
    ("DS — each statement", "Test each alone, then together. Stop as soon as you know whether it's enough; don't solve."),
    ("DS — yes/no questions", "Enough means always yes or always no. Try numbers that could break it: 0, negatives, fractions."),
    ("DS — statement (2)", "Forget what statement (1) told you while you judge (2) alone."),
    ("Quant — before solving", "Read what's being asked, and write down the units."),
    ("Quant — before choosing", "Check you answered the question asked: the right variable, the right units."),
    ("Quant — stuck after a minute", "Try the answer choices, or pick easy numbers and test."),
    ("Timing — any section", "About 2 minutes a question. If one won't open up, make your best guess and move on."),
    ("DI — tables", "Find the column the question is about before reading any rows."),
    ("DI — graphs", "Read the axes, the units and the scale before the question."),
    ("DI — multi-source", "Skim each tab for what it's about. Come back for the details each question needs."),
    ("DI — two-part", "Each column is its own question. The same option can be right for both."),
]


def run():
    facts = quant_facts()
    method = [{"id": f"m{i:02d}", "deck": "method", "front": f, "back": b} for i, (f, b) in enumerate(METHOD, 1)]
    return {"status": "approved 27 Sep 2026", "quant_facts": facts, "method": method}
