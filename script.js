/* ============================================================================
   NEON//PY — терминал решений
   0) утилиты  1) банк из 100 задач + эталонные решения
   2) профили/локальное хранилище  3) экран идентификации
   4) Python-ядро (Pyodide в Web Worker)  5) статический анализатор
   6) интерфейс  7) локальный журнал оператора  8) загрузка
   Внешних сервисов нет: задачи, подсказки и разбор считаются в браузере.
   ============================================================================ */

/* ============================ 0. UTIL ==================================== */
/* Любая непойманная ошибка показывается на экране, а не прячется:
   иначе сбой выглядит как «страница не открывается». */
window.addEventListener('error', e => fatal(e.message + (e.lineno ? ` (строка ${e.lineno})` : '')));
window.addEventListener('unhandledrejection', e => fatal('асинхронный сбой: ' + (e.reason?.message || e.reason)));
function fatal(text) {
  console.error('[neopy]', text);
  const box = document.querySelector('#fatalBox');   // без $ — вызывается и до его инициализации
  if (!box) return;
  box.hidden = false;
  box.textContent = 'СБОЙ: ' + text + ' — обновите страницу (Ctrl+F5) и попробуйте снова.';
}
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const pad2 = n => String(n).padStart(2, '0');
const nowMs = () => Date.now();

function fmtDate(ts) {
  const d = new Date(ts);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + 'с';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'м ' + pad2(s % 60) + 'с';
  return Math.floor(m / 60) + 'ч ' + pad2(m % 60) + 'м';
}
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
/* типовые грабли по тегу задачи — для локальной подсказки «крайние случаи» */
const EDGE_CASES = {
  'строки': ['пустая строка', 'строка из одного символа', 'пробелы в начале и конце', 'кириллица вместе с латиницей', 'регистр символов'],
  'арифметика': ['ноль', 'отрицательное число', 'дробное значение', 'аргументы меняются местами'],
  'условия': ['граница равенства', 'ноль', 'отрицательное число', 'два значения равны'],
  'форматирование': ['ноль', 'одноцифровые числа', 'значения, где нужны ведущие нули', 'отрицательное значение'],
  'консоль': ['число на границе', 'ввод с лишними пробелами', 'делитель равен нулю', 'пустая строка на входе'],
  'циклы': ['пустой вход', 'ноль', 'отрицательные значения', 'значение ровно на границе цикла'],
  'списки': ['пустой список', 'список из одного элемента', 'все элементы одинаковые', 'отрицательные числа', 'порядок элементов важен'],
  'словари': ['пустой словарь', 'одна пара', 'несколько пар с одинаковым значением', 'отсутствующий ключ', 'порядок обхода'],
  'функции высшего порядка': ['пустая коллекция', 'функция, которая ничего не меняет', 'порядок аргументов колбэка', 'возврат нового списка, а не исходного'],
  'рекурсия': ['базовый случай', 'аргумент 0', 'отрицательное значение', 'глубина рекурсии'],
  'итоговое': ['пустой текст', 'только пробелы', 'одно слово', 'слова разной длины и регистра']
};
function edgesFor(t) {
  return EDGE_CASES[t.tag] || ['пустой ввод', 'минимальное значение', 'максимальное значение', 'значение на границе'];
}

/* ======================= 1. BANK OF 100 TASKS ============================
   Тесты — это код на Python, выполняемый в свежем окружении после кода
   ученика. Доступные помощники:
     eq(actual, expected, note)      — значение равно ожидаемому
     close(actual, expected, note)   — числа равны с точностью 1e-6
     truthy(value, note)             — значение истинно
     raises(ExcType, fn, note)       — вызывается исключение
     out_eq(expected, note)          — stdout (последняя непустая строка) == expected
   ========================================================================== */
const TASKS = [
/* ---------- L1: числа и первый код ---------- */
{ n:'Привет, мир!', tag:'строки', sig:'def hello()', req:['hello'],
  task:'Напишите функцию <code>hello()</code>, которая возвращает строку <code>«Привет, мир!»</code>.',
  hint:'Функция должна возвращать значение через <code>return</code>, а не печатать его.',
  tests:['eq(hello(), "Привет, мир!", "точная строка с приветствием")',
         'eq(type(hello()).__name__, "str", "результат — строка")'] },

{ n:'Персональное приветствие', tag:'строки', sig:'def greet(name)', req:['greet'],
  task:'Напишите функцию <code>greet(name)</code>, которая возвращает строку вида <code>«Привет, Аня!»</code> — имя подставляется в конец, после слова «Привет», через пробел и с восклицательным знаком.',
  hint:'Соедините части через <code>+</code> или используйте f-строку: <code>f"Привет, {name}!"</code>.',
  tests:['eq(greet("Аня"), "Привет, Аня!")','eq(greet("Vlad"), "Привет, Vlad!")','eq(greet(""), "Привет, !")'] },

{ n:'Сложение', tag:'арифметика', sig:'def add(a, b)', req:['add'],
  task:'Напишите функцию <code>add(a, b)</code>, которая возвращает сумму двух чисел.',
  hint:'Верните <code>a + b</code>.',
  tests:['eq(add(2, 3), 5)','eq(add(-1, 1), 0)','eq(add(0, 0), 0)','eq(add(2.5, 2.5), 5.0)'] },

{ n:'Вычитание', tag:'арифметика', sig:'def sub(a, b)', req:['sub'],
  task:'Напишите функцию <code>sub(a, b)</code>, возвращающую разность <code>a - b</code>.',
  hint:'Помните: <code>sub(3, 10)</code> равно <code>-7</code>.',
  tests:['eq(sub(10, 4), 6)','eq(sub(-3, 5), -8)','eq(sub(7, 7), 0)'] },

{ n:'Умножение', tag:'арифметика', sig:'def mul(a, b)', req:['mul'],
  task:'Напишите функцию <code>mul(a, b)</code>, возвращающую произведение двух чисел.',
  hint:'Оператор умножения в Python — звёздочка <code>*</code>.',
  tests:['eq(mul(6, 7), 42)','eq(mul(-2, 3), -6)','eq(mul(0, 99), 0)'] },

{ n:'Деление', tag:'арифметика', sig:'def div(a, b)', req:['div'],
  task:'Напишите функцию <code>div(a, b)</code>, возвращающую результат обычного деления <code>a / b</code>. Деление на ноль в Python само выбрасывает <code>ZeroDivisionError</code> — перехватывать его не нужно.',
  hint:'Оператор <code>/</code> всегда даёт дробный результат: <code>9 / 3</code> → <code>3.0</code>.',
  tests:['eq(div(10, 4), 2.5)','eq(div(9, 3), 3.0)','eq(div(7, 2), 3.5)',
         'raises(ZeroDivisionError, lambda: div(1, 0), "деление на ноль должно падать")'] },

{ n:'Целочисленное деление', tag:'арифметика', sig:'def int_div(a, b)', req:['int_div'],
  task:'Напишите функцию <code>int_div(a, b)</code>, возвращающую <code>a // b</code> — целую часть от деления с округлением вниз (для отрицательных чисел «вниз» — к минус бесконечности).',
  hint:'В Python есть оператор «целочисленное деление» — две косые черты <code>//</code>.',
  tests:['eq(int_div(7, 2), 3)','eq(int_div(-7, 2), -4)','eq(int_div(8, 4), 2)',
         'raises(ZeroDivisionError, lambda: int_div(1, 0))'] },

{ n:'Остаток от деления', tag:'арифметика', sig:'def mod(a, b)', req:['mod'],
  task:'Напишите функцию <code>mod(a, b)</code>, возвращающую остаток от деления <code>a % b</code>.',
  hint:'Оператор остатка — <code>%</code>. Учтите, что в Python остаток всегда того же знака, что и делимое.',
  tests:['eq(mod(7, 2), 1)','eq(mod(10, 5), 0)','eq(mod(-7, 2), 1)'] },

{ n:'Степень', tag:'арифметика', sig:'def power(a, n)', req:['power'],
  task:'Напишите функцию <code>power(a, n)</code>, возвращающую <code>a</code> в степени <code>n</code>.',
  hint:'Оператор возведения в степень — две звёздочки <code>**</code>. Любое число в нулевой степени равно 1.',
  tests:['eq(power(2, 10), 1024)','eq(power(5, 0), 1)','eq(power(-2, 3), -8)'] },

{ n:'Модуль числа', tag:'арифметика', sig:'def abs_value(x)', req:['abs_value'],
  task:'Напишите функцию <code>abs_value(x)</code>, возвращающую модуль числа — само число, если оно неотрицательное, и с противоположным знаком, если отрицательное.',
  hint:'Ветка <code>if</code> или тернарный оператор: <code>x if x >= 0 else -x</code>. Можно и просто <code>abs(x)</code>.',
  tests:['eq(abs_value(-5), 5)','eq(abs_value(0), 0)','eq(abs_value(3.5), 3.5)'] },

/* ---------- L2: арифметика и консоль ---------- */
{ n:'Большее из двух', tag:'условия', sig:'def max2(a, b)', req:['max2'],
  task:'Напишите функцию <code>max2(a, b)</code>, возвращающую большее из двух чисел. При равенстве возвращается само число.',
  hint:'Используйте <code>if a &gt; b:</code> и два <code>return</code>, либо встроенную <code>max()</code>.',
  tests:['eq(max2(3, 7), 7)','eq(max2(-3, -7), -3)','eq(max2(5, 5), 5)'] },

{ n:'Меньшее из двух', tag:'условия', sig:'def min2(a, b)', req:['min2'],
  task:'Напишите функцию <code>min2(a, b)</code>, возвращающую меньшее из двух чисел.',
  hint:'Зеркальная задача: <code>if a &lt; b:</code> … либо <code>min()</code>.',
  tests:['eq(min2(3, 7), 3)','eq(min2(-3, -7), -7)','eq(min2(2, 2), 2)'] },

{ n:'Квадрат числа', tag:'арифметика', sig:'def square(x)', req:['square'],
  task:'Напишите функцию <code>square(x)</code>, возвращающую <code>x * x</code>.',
  hint:'Степень двойки — <code>x ** 2</code>.',
  tests:['eq(square(0), 0)','eq(square(-4), 16)','eq(square(1.5), 2.25)'] },

{ n:'Площадь прямоугольника', tag:'арифметика', sig:'def area(w, h)', req:['area'],
  task:'Напишите функцию <code>area(w, h)</code>, возвращающую площадь прямоугольника со сторонами <code>w</code> и <code>h</code>.',
  hint:'Площадь прямоугольника — произведение сторон.',
  tests:['eq(area(3, 4), 12)','eq(area(2.5, 4), 10.0)','eq(area(0, 7), 0)'] },

{ n:'Периметр прямоугольника', tag:'арифметика', sig:'def perimeter(a, b)', req:['perimeter'],
  task:'Напишите функцию <code>perimeter(a, b)</code>, возвращающую периметр прямоугольника: сумма всех сторон.',
  hint:'У прямоугольника две пары равных сторон: <code>a + b + a + b</code>.',
  tests:['eq(perimeter(3, 4), 14)','eq(perimeter(1, 1), 4)','eq(perimeter(0, 5), 10)'] },

{ n:'Цельсий → Фаренгейт', tag:'арифметика', sig:'def celsius_to_f(c)', req:['celsius_to_f'],
  task:'Напишите функцию <code>celsius_to_f(c)</code>, переводящую температуру из градусов Цельсия в градусы Фаренгейта по формуле <code>F = 9 * C / 5 + 32</code>.',
  hint:'Следите за порядком: сначала умножьте на 9, потом разделите на 5, и только затем прибавьте 32.',
  tests:['eq(celsius_to_f(100), 212)','eq(celsius_to_f(0), 32)','eq(celsius_to_f(-40), -40)',
         'eq(celsius_to_f(37), 98.6)'] },

{ n:'Фаренгейт → Цельсий', tag:'арифметика', sig:'def fahrenheit_to_c(f)', req:['fahrenheit_to_c'],
  task:'Напишите функцию <code>fahrenheit_to_c(f)</code>, переводящую градусы Фаренгейта в градусы Цельсия по формуле <code>C = 5 * (F - 32) / 9</code>.',
  hint:'Вычитание 32 делается первым, иначе формула даст ошибку. Проверьте себя на <code>f = 32</code>: ответ должен быть 0.',
  tests:['eq(fahrenheit_to_c(212), 100)','eq(fahrenheit_to_c(32), 0)','eq(fahrenheit_to_c(68), 20)',
         'close(fahrenheit_to_c(100), 37.777777, "100°F — это примерно 37.78°C")'] },

{ n:'Секунды в ч:м:с', tag:'форматирование', sig:'def seconds_to_hms(s)', req:['seconds_to_hms'],
  task:'Напишите функцию <code>seconds_to_hms(s)</code>, которая превращает количество секунд в строку вида <code>«Ч:ММ:СС»</code>. Часы и минуты без ведущих нулей, минуты и секунды — всегда двузначные. Например: <code>3661 → "1:01:01"</code>.',
  hint:'Сначала вычислите <code>s // 60</code> (минуты) и <code>s % 60</code> (секунды), потом разделите минуты на часы. Для двузначного вывода используйте <code>:02d</code> в f-строке.',
  tests:['eq(seconds_to_hms(3661), "1:01:01")','eq(seconds_to_hms(59), "0:00:59")',
         'eq(seconds_to_hms(3600), "1:00:00")','eq(seconds_to_hms(7325), "2:02:05")'] },

{ n:'Дней в месяце', tag:'условия', sig:'def days_in_month(year, month)', req:['days_in_month'],
  task:'Напишите функцию <code>days_in_month(year, month)</code>, возвращающую количество дней в месяце. <code>month</code> — число от 1 до 12. Февраль — 29 дней, если год високосный, иначе 28. Високосный год: делится на 4, но не делится на 100, либо делится на 400.',
  hint:'Сначала возьмите базовую длину месяца из списка <code>[31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]</code>, затем отдельно обработайте февраль.',
  tests:['eq(days_in_month(2024, 2), 29)','eq(days_in_month(2023, 2), 28)','eq(days_in_month(2023, 12), 31)',
         'eq(days_in_month(2024, 4), 30)','eq(days_in_month(2000, 2), 29)','eq(days_in_month(1900, 2), 28)'] },

{ n:'[КОНСОЛЬ] Калькулятор', tag:'консоль', sig:'', req:[], stdin:true,
  task:'Считайте с клавиатуры два числа и оператор, каждое значение — с новой строки:\n<i>8\n*\n3</i>\nи выведите результат операции одним числом. Операторы: <code>+</code>, <code>-</code>, <code>*</code>, <code>/code>.',
  hint:'Три вызова <code>input()</code>, затем <code>print()</code> нужного результата. Не забудьте <code>.strip()</code> для строки с оператором.',
  tests:[{ code:'out_eq("24", "8 * 3 = 24")', stdin:'8\n*\n3\n' },
         { code:'out_eq("2.5", "10 / 4 = 2.5")', stdin:'10\n/\n4\n' },
         { code:'out_eq("-2", "7 - 9 = -2")', stdin:'7\n-\n9\n' }] },

/* ---------- L3: строки ---------- */
{ n:'Длина строки', tag:'строки', sig:'def len_str(s)', req:['len_str'],
  task:'Напишите функцию <code>len_str(s)</code>, возвращающую количество символов в строке <code>s</code>.',
  hint:'В Python есть готовая функция <code>len(s)</code>.',
  tests:['eq(len_str(""), 0)','eq(len_str("привет"), 6)','eq(len_str("a b"), 3)'] },

{ n:'Верхний регистр', tag:'строки', sig:'def upper(s)', req:['upper'],
  task:'Напишите функцию <code>upper(s)</code>, возвращающую строку <code>s</code>, приведённую к верхнему регистру.',
  hint:'У строк есть метод <code>s.upper()</code>.',
  tests:['eq(upper("привет"), "ПРИВЕТ")','eq(upper("AbC-1"), "ABC-1")'] },

{ n:'Нижний регистр', tag:'строки', sig:'def lower(s)', req:['lower'],
  task:'Напишите функцию <code>lower(s)</code>, возвращающую строку <code>s</code>, приведённую к нижнему регистру.',
  hint:'Метод строки: <code>s.lower()</code>.',
  tests:['eq(lower("ПРИВЕТ"), "привет")','eq(lower("AbC-1"), "abc-1")'] },

{ n:'Обрезка пробелов', tag:'строки', sig:'def strip(s)', req:['strip'],
  task:'Напишите функцию <code>strip(s)</code>, удаляющую пробелы в начале и в конце строки, но не меняющую внутренние.',
  hint:'Метод <code>s.strip()</code>.',
  tests:['eq(strip("  привет  "), "привет")','eq(strip("a b"), "a b")','eq(strip(""), "")'] },

{ n:'Разворот строки', tag:'строки', sig:'def reverse(s)', req:['reverse'],
  task:'Напишите функцию <code>reverse(s)</code>, возвращающую строку <code>s</code> задом наперёд.',
  hint:'Срез <code>s[::-1]</code> разворачивает строку целиком.',
  tests:['eq(reverse("abc"), "cba")','eq(reverse("привет"), "тевирп")','eq(reverse(""), "")'] },

{ n:'Подсчёт символа', tag:'строки', sig:'def count_char(s, ch)', req:['count_char'],
  task:'Напишите функцию <code>count_char(s, ch)</code>, возвращающую, сколько раз символ <code>ch</code> встречается в строке <code>s</code>.',
  hint:'Метод <code>s.count(ch)</code>.',
  tests:['eq(count_char("banana", "a"), 3)','eq(count_char("привет", "р"), 1)','eq(count_char("abc", "z"), 0)'] },

{ n:'Первый и последний', tag:'строки', sig:'def first_last(s)', req:['first_last'],
  task:'Напишите функцию <code>first_last(s)</code>, возвращающую кортеж (tuple) из двух элементов: первый символ и последний символ строки. Для строки длины 1 оба элемента равны этому символу.',
  hint:'Первый символ — <code>s[0]</code>, последний — <code>s[-1]</code>. Кортеж пишется так: <code>(a, b)</code>.',
  tests:['eq(first_last("питон"), ("п", "н"))','eq(first_last("ab"), ("a", "b"))','eq(first_last("x"), ("x", "x"))'] },

{ n:'Средний символ', tag:'строки', sig:'def middle_char(s)', req:['middle_char'],
  task:'Напишите функцию <code>middle_char(s)</code>, возвращающую символ на позиции <code>len(s) // 2</code> (нумерация с нуля). Для нечётной длины это настоящий центральный символ, для чётной — левый из двух центральных.',
  hint:'Индекс можно вычислить как <code>len(s) // 2</code>.',
  tests:['eq(middle_char("питон"), "т")','eq(middle_char("ab"), "b")','eq(middle_char("abc"), "b")'] },

{ n:'Палиндром', tag:'строки', sig:'def is_palindrome(s)', req:['is_palindrome'],
  task:'Напишите функцию <code>is_palindrome(s)</code>, которая возвращает <code>True</code>, если строка читается одинаково в обе стороны, иначе <code>False</code>. Регистр и пробелы игнорируются: <code>"А роза упала на лапу Азора"</code> — палиндром.',
  hint:'Сначала приведите строку к нижнему регистру и уберите пробелы (<code>s.lower().replace(" ", "")</code>), затем сравните с её разворотом.',
  tests:['eq(is_palindrome("aba"), True)','eq(is_palindrome("AbBa"), True)',
         'eq(is_palindrome("привет"), False)','eq(is_palindrome("А роза упала на лапу Азора"), True)',
         'eq(is_palindrome(""), True)'] },

{ n:'Замена символов', tag:'строки', sig:'def replace_all(s, a, b)', req:['replace_all'],
  task:'Напишите функцию <code>replace_all(s, a, b)</code>, которая заменяет в строке <code>s</code> все вхождения символа <code>a</code> на символ <code>b</code>.',
  hint:'Метод строки: <code>s.replace(a, b)</code>.',
  tests:['eq(replace_all("a-b-c", "-", "+"), "a+b+c")','eq(replace_all("aaa", "a", "b"), "bbb")',
         'eq(replace_all("abc", "z", "y"), "abc")'] },

/* ---------- L4: строки, списки текста ---------- */
{ n:'Капитализация слов', tag:'строки', sig:'def title_case(s)', req:['title_case'],
  task:'Напишите функцию <code>title_case(s)</code>, которая превращает каждое слово строки в слово с заглавной первой буквой и остальными строчными. Пробелы между словами сохраняются как есть.',
  hint:'Метод <code>s.title()</code> делает почти то же самое.',
  tests:['eq(title_case("привет мир"), "Привет Мир")','eq(title_case("hELLO wORLD"), "Hello World")',
         'eq(title_case(""), "")'] },

{ n:'Только цифры?', tag:'строки', sig:'def is_digits(s)', req:['is_digits'],
  task:'Напишите функцию <code>is_digits(s)</code>, которая возвращает <code>True</code>, если строка состоит только из цифр и непустая, иначе <code>False</code>. Пустая строка — не только цифры.',
  hint:'Метод <code>s.isdigit()</code> вернёт <code>True</code> и для пустой строки, поэтому проверьте её отдельно.',
  tests:['eq(is_digits("12345"), True)','eq(is_digits("12a"), False)','eq(is_digits(""), False)',
         'eq(is_digits(" -7"), False)'] },

{ n:'Начинается с', tag:'строки', sig:'def starts_with(s, p)', req:['starts_with'],
  task:'Напишите функцию <code>starts_with(s, p)</code>, которая возвращает <code>True</code>, если строка <code>s</code> начинается с подстроки <code>p</code>.',
  hint:'Метод <code>s.startswith(p)</code>.',
  tests:['eq(starts_with("привет", "при"), True)','eq(starts_with("abc", "b"), False)','eq(starts_with("", ""), True)'] },

{ n:'Заканчивается на', tag:'строки', sig:'def ends_with(s, p)', req:['ends_with'],
  task:'Напишите функцию <code>ends_with(s, p)</code>, которая возвращает <code>True</code>, если строка <code>s</code> заканчивается подстрокой <code>p</code>.',
  hint:'Метод <code>s.endswith(p)</code>.',
  tests:['eq(ends_with("привет", "вет"), True)','eq(ends_with("abc", "a"), False)','eq(ends_with("кот", "т"), True)'] },

{ n:'Разбить на слова', tag:'строки', sig:'def split_words(s)', req:['split_words'],
  task:'Напишите функцию <code>split_words(s)</code>, возвращающую список слов строки. Лишние пробелы в начале, в конце и между словами не должны давать пустых элементов.',
  hint:'Метод <code>s.split()</code> без аргументов сам справляется с лишними пробелами.',
  tests:['eq(split_words("раз два три"), ["раз", "два", "три"])','eq(split_words("  a  b "), ["a", "b"])',
         'eq(split_words(""), [])'] },

{ n:'Склеить слова', tag:'строки', sig:'def join_words(words, sep)', req:['join_words'],
  task:'Напишите функцию <code>join_words(words, sep)</code>, которая склеивает элементы списка <code>words</code> в строку через разделитель <code>sep</code>.',
  hint:'Метод <code>sep.join(words)</code> — разделитель вызывает список.',
  tests:['eq(join_words(["a", "b", "c"], "-"), "a-b-c")','eq(join_words([], ", "), "")',
         'eq(join_words(["раз", "два"], " "), "раз два")'] },

{ n:'Первые N символов', tag:'строки', sig:'def first_n(s, n)', req:['first_n'],
  task:'Напишите функцию <code>first_n(s, n)</code>, возвращающую первые <code>n</code> символов строки <code>s</code>. Если символов меньше — верните строку целиком. При <code>n = 0</code> верните пустую строку.',
  hint:'Срез <code>s[:n]</code> уже умеет всё это, включая <code>n &gt; len(s)</code>.',
  tests:['eq(first_n("привет", 3), "при")','eq(first_n("abc", 10), "abc")','eq(first_n("abc", 0), "")'] },

{ n:'Убрать пробелы', tag:'строки', sig:'def remove_spaces(s)', req:['remove_spaces'],
  task:'Напишите функцию <code>remove_spaces(s)</code>, удаляющую из строки <code>s</code> все пробелы — в начале, в конце и внутри.',
  hint:'Метод <code>s.replace(" ", "")</code>.',
  tests:['eq(remove_spaces(" a b  c "), "abc")','eq(remove_spaces(""), "")','eq(remove_spaces("а б"), "аб")'] },

{ n:'Количество слов', tag:'строки', sig:'def count_words(s)', req:['count_words'],
  task:'Напишите функцию <code>count_words(s)</code>, возвращающую количество слов в строке (пробелы игнорируются, подряд идущие пробелы не создают пустых слов).',
  hint:'Посчитайте элементы списка <code>s.split()</code> — например, через <code>len()</code>.',
  tests:['eq(count_words("раз два три"), 3)','eq(count_words("   "), 0)','eq(count_words("одно"), 1)'] },

{ n:'Самое длинное слово', tag:'строки', sig:'def longest_word(s)', req:['longest_word'],
  task:'Напишите функцию <code>longest_word(s)</code>, возвращающую самое длинное слово строки. Если самых длинных слов несколько — верните то, которое встретилось раньше. Для пустой строки верните <code>""</code>.',
  hint:'Пройдитесь циклом по <code>s.split()</code> и запоминайте самое длинное; при равной длине не перезаписывайте ответ.',
  tests:['eq(longest_word("я очень длинное слово здесь"), "длинное")','eq(longest_word("a bb"), "bb")',
         'eq(longest_word("раз два"), "раз")','eq(longest_word(""), "")'] },

/* ---------- L5: условия ---------- */
{ n:'Чётное ли число?', tag:'условия', sig:'def is_even(n)', req:['is_even'],
  task:'Напишите функцию <code>is_even(n)</code>, которая возвращает <code>True</code> для чётных целых чисел (в том числе отрицательных и нуля) и <code>False</code> иначе.',
  hint:'Проверьте остаток: <code>n % 2 == 0</code>.',
  tests:['eq(is_even(4), True)','eq(is_even(7), False)','eq(is_even(0), True)','eq(is_even(-3), False)'] },

{ n:'Нечётное ли число?', tag:'условия', sig:'def is_odd(n)', req:['is_odd'],
  task:'Напишите функцию <code>is_odd(n)</code>, которая возвращает <code>True</code> для нечётных целых чисел и <code>False</code> иначе.',
  hint:'Остаток <code>n % 2</code> для нечётного числа равен 1 (и для отрицательных чисел тоже).',
  tests:['eq(is_odd(7), True)','eq(is_odd(8), False)','eq(is_odd(-3), True)','eq(is_odd(0), False)'] },

{ n:'Знак числа', tag:'условия', sig:'def sign(x)', req:['sign'],
  task:'Напишите функцию <code>sign(x)</code>, возвращающую <code>1</code> для положительного числа, <code>-1</code> для отрицательного и <code>0</code> для нуля.',
  hint:'Две проверки <code>if</code> с ранним <code>return</code> внутри работают без <code>else</code>.',
  tests:['eq(sign(5), 1)','eq(sign(-5), -1)','eq(sign(0), 0)','eq(sign(0.5), 1)'] },

{ n:'Високосный год', tag:'условия', sig:'def is_leap_year(year)', req:['is_leap_year'],
  task:'Напишите функцию <code>is_leap_year(year)</code>. Год високосный, если он делится на 4, но не делится на 100; либо делится на 400 (например, 2000 — високосный, а 1900 — нет).',
  hint:'Сначала проверьте делимость на 400, потом — на 100 и 4 одновременно. Не забывайте про <code>and</code>/<code>or</code>.',
  tests:['eq(is_leap_year(2024), True)','eq(is_leap_year(2023), False)','eq(is_leap_year(1900), False)',
         'eq(is_leap_year(2000), True)','eq(is_leap_year(2100), False)'] },

{ n:'Максимум из трёх', tag:'условия', sig:'def max_of_three(a, b, c)', req:['max_of_three'],
  task:'Напишите функцию <code>max_of_three(a, b, c)</code>, возвращающую наибольшее из трёх чисел (без встроенной <code>max</code> — используйте условия).',
  hint:'Сравните <code>a</code> и <code>b</code>, найдите максимум этой пары, затем сравните с <code>c</code>.',
  tests:['eq(max_of_three(1, 9, 5), 9)','eq(max_of_three(-5, -1, -9), -1)','eq(max_of_three(3, 3, 3), 3)'] },

{ n:'[КОНСОЛЬ] FizzBuzz', tag:'консоль', sig:'', req:[], stdin:true,
  task:'Считайте целое число <code>n</code> и выведите одно слово:\n• делится на 3 и на 5 → <code>FizzBuzz</code>\n• делится только на 3 → <code>Fizz</code>\n• делится только на 5 → <code>Buzz</code>\n• иначе — само число',
  hint:'Проверяйте самое частое условие первым — случай «и 3, и 5» должен попасть в первую ветку. Не забудьте превратить результат в строку через <code>print()</code>.',
  tests:[{ code:'out_eq("FizzBuzz", "15 -> FizzBuzz")', stdin:'15\n' },
         { code:'out_eq("Fizz", "3 -> Fizz")', stdin:'3\n' },
         { code:'out_eq("Buzz", "5 -> Buzz")', stdin:'5\n' },
         { code:'out_eq("7", "7 -> 7")', stdin:'7\n' }] },

{ n:'Оценка по баллам', tag:'условия', sig:'def grade(score)', req:['grade'],
  task:'Напишите функцию <code>grade(score)</code>, возвращающую оценку строкой:\n• <code>90</code> и выше → <code>"отлично"</code>\n• от <code>70</code> до <code>89</code> → <code>"хорошо"</code>\n• от <code>50</code> до <code>69</code> → <code>"удовлетворительно"</code>\n• ниже <code>50</code> → <code>"неудовлетворительно"</code>',
  hint:'Выстраивайте цепочку <code>if … elif … elif … else</code> от большего к меньшему — тогда границы не пересекутся.',
  tests:['eq(grade(95), "отлично")','eq(grade(90), "отлично")','eq(grade(89), "хорошо")','eq(grade(70), "хорошо")',
         'eq(grade(69), "удовлетворительно")','eq(grade(49), "неудовлетворительно")'] },

{ n:'Оба чётные', tag:'условия', sig:'def both_even(a, b)', req:['both_even'],
  task:'Напишите функцию <code>both_even(a, b)</code>: <code>True</code>, только если <b>оба</b> числа чётные.',
  hint:'Нужны <b>два</b> условия, соединённые <code>and</code>: <code>a % 2 == 0 and b % 2 == 0</code>.',
  tests:['eq(both_even(2, 4), True)','eq(both_even(2, 3), False)','eq(both_even(3, 3), False)','eq(both_even(0, 0), True)'] },

{ n:'Тип треугольника', tag:'условия', sig:'def triangle_type(a, b, c)', req:['triangle_type'],
  task:'Напишите функцию <code>triangle_type(a, b, c)</code> для трёх сторон. Если сумма двух любых сторон меньше третьей — верните <code>"невозможный"</code>. Иначе, если все стороны равны — <code>"равносторонний"</code>, если равны ровно две — <code>"равнобедренный"</code>, иначе <code>"разносторонний"</code>.',
  hint:'Сначала проверьте существование треугольника, потом отсортируйте стороны и сравните соседние: <code>s[0] == s[2]</code> и <code>s[0] == s[1]</code>.',
  tests:['eq(triangle_type(3, 3, 3), "равносторонний")','eq(triangle_type(3, 3, 4), "равнобедренный")',
         'eq(triangle_type(3, 4, 4), "равнобедренный")','eq(triangle_type(3, 4, 5), "разносторонний")',
         'eq(triangle_type(1, 2, 10), "невозможный")'] },

{ n:'Число в диапазоне', tag:'условия', sig:'def in_range(n, a, b)', req:['in_range'],
  task:'Напишите функцию <code>in_range(n, a, b)</code>: <code>True</code>, если <code>n</code> лежит в отрезке <code>[a; b]</code> включительно (обе границы входят).',
  hint:'Нужны сразу два сравнения: <code>a &lt;= n and n &lt;= b</code>.',
  tests:['eq(in_range(5, 1, 10), True)','eq(in_range(1, 1, 10), True)','eq(in_range(10, 1, 10), True)',
         'eq(in_range(11, 1, 10), False)','eq(in_range(0, 1, 10), False)'] },

/* ---------- L6: циклы ---------- */
{ n:'Сумма от 1 до N', tag:'циклы', sig:'def sum_to_n(n)', req:['sum_to_n'],
  task:'Напишите функцию <code>sum_to_n(n)</code>, возвращающую сумму чисел от 1 до <code>n</code> включительно. Для <code>n = 0</code> верните 0.',
  hint:'Можно циклом <code>for i in range(1, n + 1)</code> с накопителем, а можно одной формулой <code>n * (n + 1) // 2</code>.',
  tests:['eq(sum_to_n(5), 15)','eq(sum_to_n(1), 1)','eq(sum_to_n(0), 0)','eq(sum_to_n(100), 5050)'] },

{ n:'Факториал', tag:'циклы', sig:'def factorial(n)', req:['factorial'],
  task:'Напишите функцию <code>factorial(n)</code>, возвращающую факториал числа: произведение чисел от 1 до <code>n</code>. По определению <code>0! = 1</code>.',
  hint:'Начните результат с 1 и умножайте в цикле <code>for i in range(1, n + 1)</code>.',
  tests:['eq(factorial(0), 1)','eq(factorial(1), 1)','eq(factorial(5), 120)','eq(factorial(10), 3628800)'] },

{ n:'Сумма цифр числа', tag:'циклы', sig:'def sum_digits(n)', req:['sum_digits'],
  task:'Напишите функцию <code>sum_digits(n)</code>, возвращающую сумму цифр числа <code>n</code>. Знак числа игнорируется: <code>sum_digits(-45) == 9</code>.',
  hint:'Преобразуйте число в строку через <code>str(abs(n))</code> и сложите <code>int(c)</code> для каждого символа, либо делите и сокращайте: <code>n % 10</code> и <code>n // 10</code>.',
  tests:['eq(sum_digits(123), 6)','eq(sum_digits(0), 0)','eq(sum_digits(-45), 9)','eq(sum_digits(999), 27)'] },

{ n:'Разворот числа', tag:'циклы', sig:'def reverse_number(n)', req:['reverse_number'],
  task:'Напишите функцию <code>reverse_number(n)</code>, возвращающую число с цифрами в обратном порядке. Знак сохраняется: <code>reverse_number(-123) == -321</code>. Нули в конце исходного числа отбрасываются: <code>reverse_number(1200) == 21</code>.',
  hint:'Возьмите модуль числа, разверните его как строку и превратите обратно в <code>int</code> — он сам отбросит ведущие нули. Знак придётся вернуть вручную.',
  tests:['eq(reverse_number(123), 321)','eq(reverse_number(1200), 21)','eq(reverse_number(-123), -321)',
         'eq(reverse_number(7), 7)'] },

{ n:'Количество цифр', tag:'циклы', sig:'def count_digits(n)', req:['count_digits'],
  task:'Напишите функцию <code>count_digits(n)</code>, возвращающую количество цифр в числе <code>n</code> (без знака минус). Для числа 0 ответ — 1.',
  hint:'Для положительных чисел работает <code>len(str(abs(n)))</code> — но проверьте случай нуля.',
  tests:['eq(count_digits(12345), 5)','eq(count_digits(0), 1)','eq(count_digits(-808), 3)'] },

{ n:'Простое число', tag:'циклы', sig:'def is_prime(n)', req:['is_prime'],
  task:'Напишите функцию <code>is_prime(n)</code>: <code>True</code>, если <code>n</code> — простое число (делится только на 1 и на себя), иначе <code>False</code>. Числа 0, 1 и отрицательные — не простые.',
  hint:'Сначала отсеките <code>n &lt; 2</code>. Проверяйте делители только до <code>int(n ** 0.5) + 1</code>, используя <code>n % i == 0</code> и <code>range(2, …)</code>.',
  tests:['eq(is_prime(2), True)','eq(is_prime(1), False)','eq(is_prime(0), False)','eq(is_prime(-7), False)',
         'eq(is_prime(17), True)','eq(is_prime(25), False)','eq(is_prime(97), True)'] },

{ n:'Числа Фибоначчи', tag:'циклы', sig:'def fib(n)', req:['fib'],
  task:'Напишите функцию <code>fib(n)</code>, возвращающую <code>n</code>-е число Фибоначчи при нумерации с нуля: <code>fib(0) = 0</code>, <code>fib(1) = 1</code>, далее сумма двух предыдущих.',
  hint:'Храните два соседних значения в переменных <code>a</code> и <code>b</code> и сдвигайте их в цикле <code>for _ in range(n)</code>.',
  tests:['eq(fib(0), 0)','eq(fib(1), 1)','eq(fib(2), 1)','eq(fib(10), 55)','eq(fib(20), 6765)'] },

{ n:'НОД', tag:'циклы', sig:'def gcd(a, b)', req:['gcd'],
  task:'Напишите функцию <code>gcd(a, b)</code>, возвращающую наибольший общий делитель двух неотрицательных целых чисел. <code>gcd(0, 5) == 5</code>.',
  hint:'Алгоритм Евклида: пока <code>b != 0</code>, присваивайте <code>a, b = b, a % b</code>.',
  tests:['eq(gcd(12, 18), 6)','eq(gcd(7, 13), 1)','eq(gcd(0, 5), 5)','eq(gcd(9, 9), 9)','eq(gcd(100, 75), 25)'] },

{ n:'НОК', tag:'циклы', sig:'def lcm(a, b)', req:['lcm'],
  task:'Напишите функцию <code>lcm(a, b)</code>, возвращающую наименьшее общее кратное двух положительных целых чисел. Воспользуйтесь формулой <code>a * b / gcd(a, b)</code>, но помните про целочисленность: используйте <code>//</code>.',
  hint:'Тесты выполняются в чистом окружении — все нужные функции должны быть в <b>твоём</b> коде. Определите рядом НОД (например, функцией <code>gcd</code> алгоритмом Евклида), затем верните <code>(a // gcd(a, b)) * b</code>.',
  tests:['eq(lcm(4, 6), 12)','eq(lcm(3, 5), 15)','eq(lcm(7, 7), 7)','eq(lcm(2, 3), 6)'] },

{ n:'Сумма чётных', tag:'циклы', sig:'def sum_even(nums)', req:['sum_even'],
  task:'Напишите функцию <code>sum_even(nums)</code>, возвращающую сумму всех чётных чисел в списке. Для пустого списка верните 0.',
  hint:'Пройдитесь по списку и добавляйте к накопителю только числа, для которых <code>n % 2 == 0</code>.',
  tests:['eq(sum_even([1, 2, 3, 4]), 6)','eq(sum_even([]), 0)','eq(sum_even([-2, -3]), -2)','eq(sum_even([2, 2, 2]), 6)'] },

/* ---------- L7: списки ---------- */
{ n:'Максимум списка', tag:'списки', sig:'def max_of_list(nums)', req:['max_of_list'],
  task:'Напишите функцию <code>max_of_list(nums)</code>, возвращающую наибольший элемент списка <b>без встроенной max()</b>. Для пустого списка верните <code>None</code>.',
  hint:'Сохраните первый элемент как «лучший» и сравнивайте с ним остальные. Не забудьте проверить пустой список в самом начале.',
  tests:['eq(max_of_list([1, 5, 3]), 5)','eq(max_of_list([-3]), -3)','eq(max_of_list([]), None)',
         'eq(max_of_list([2, 2, 1]), 2)'] },

{ n:'Минимум списка', tag:'списки', sig:'def min_of_list(nums)', req:['min_of_list'],
  task:'Напишите функцию <code>min_of_list(nums)</code>, возвращающую наименьший элемент списка <b>без встроенной min()</b>. Для пустого списка верните <code>None</code>.',
  hint:'Как и в предыдущей задаче: первый элемент — «эталон», дальше сравнения.',
  tests:['eq(min_of_list([4, 2, 9]), 2)','eq(min_of_list([7]), 7)','eq(min_of_list([]), None)'] },

{ n:'Индекс элемента', tag:'списки', sig:'def find_index(nums, x)', req:['find_index'],
  task:'Напишите функцию <code>find_index(nums, x)</code>, возвращающую индекс первого вхождения числа <code>x</code> в списке или <code>-1</code>, если его нет.',
  hint:'Переберите список через <code>enumerate(nums)</code> и сделайте ранний <code>return</code> при совпадении. После цикла верните <code>-1</code>.',
  tests:['eq(find_index([1, 2, 3], 2), 1)','eq(find_index([1, 2, 1], 1), 0)','eq(find_index([1, 2, 3], 9), -1)',
         'eq(find_index([], 1), -1)'] },

{ n:'Есть ли дубликаты', tag:'списки', sig:'def has_duplicate(nums)', req:['has_duplicate'],
  task:'Напишите функцию <code>has_duplicate(nums)</code>: <code>True</code>, если в списке есть хотя бы одно значение, встречающееся больше одного раза.',
  hint:'Без <code>set()</code>: сравните каждый элемент с предыдущими или храните уже увиденные значения в другом списке.',
  tests:['eq(has_duplicate([1, 2, 1]), True)','eq(has_duplicate([1, 2, 3]), False)','eq(has_duplicate([]), False)',
         'eq(has_duplicate([5, 5]), True)'] },

{ n:'Только уникальные', tag:'списки', sig:'def unique(nums)', req:['unique'],
  task:'Напишите функцию <code>unique(nums)</code>, возвращающую новый список без повторений, <b>сохраняя порядок первых появления</b> элементов. Использовать <code>set()</code> нельзя.',
  hint:'Собирайте результат в новый список и добавляйте элемент, только если его ещё нет в списке результата (<code>if x not in res</code>).',
  tests:['eq(unique([1, 2, 1, 3, 2]), [1, 2, 3])','eq(unique([]), [])','eq(unique([5, 5, 5]), [5])',
         'eq(unique(["b", "a", "b"]), ["b", "a"])'] },

{ n:'Слияние отсортированных', tag:'списки', sig:'def merge_sorted(a, b)', req:['merge_sorted'],
  task:'Напишите функцию <code>merge_sorted(a, b)</code>, которая сливает два <b>уже отсортированных</b> списка в один отсортированный список. Повторяющиеся элементы сохраняются, встроенную <code>sort()</code> использовать нельзя.',
  hint:'Классический «кран»: держите два указателя <code>i</code> и <code>j</code>, берите меньший из головных элементов и сдвигайте нужный указатель.',
  tests:['eq(merge_sorted([1, 3, 5], [2, 4]), [1, 2, 3, 4, 5])','eq(merge_sorted([], []), [])',
         'eq(merge_sorted([], [1, 2]), [1, 2])','eq(merge_sorted([2, 2], [2]), [2, 2, 2])'] },

{ n:'Циклический сдвиг', tag:'списки', sig:'def rotate(nums, k)', req:['rotate'],
  task:'Напишите функцию <code>rotate(nums, k)</code>, которая циклически сдвигает список влево на <code>k</code> позиций и возвращает новый список. <code>k</code> может быть больше длины списка. Для пустого списка верните пустой список.',
  hint:'Сначала приведите <code>k</code> к диапазону: <code>k %= len(nums)</code>. Остаток соберите из двух кусков через сложение списков <code> nums[k:] + nums[:k] </code>.',
  tests:['eq(rotate([1, 2, 3, 4, 5], 2), [3, 4, 5, 1, 2])','eq(rotate([1, 2, 3], 0), [1, 2, 3])',
         'eq(rotate([1, 2, 3], 4), [2, 3, 1])','eq(rotate([], 3), [])'] },

{ n:'Разбить на куски', tag:'списки', sig:'def chunk(nums, k)', req:['chunk'],
  task:'Напишите функцию <code>chunk(nums, k)</code>, разбивающую список на подсписки длины <code>k</code>. Последний кусок может быть короче. Например: <code>chunk([1,2,3,4,5], 2) → [[1,2],[3,4],[5]]</code>.',
  hint:'Проходите по индексам с шагом <code>k</code>: <code>for i in range(0, len(nums), k):</code> и добавляйте срез <code>nums[i:i+k]</code>.',
  tests:['eq(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])','eq(chunk([], 3), [])',
         'eq(chunk([1, 2, 3], 3), [[1, 2, 3]])','eq(chunk([1, 2, 3], 10), [[1, 2, 3]])'] },

{ n:'Среднее значение', tag:'списки', sig:'def average(nums)', req:['average'],
  task:'Напишите функцию <code>average(nums)</code>, возвращающую среднее арифметическое всех чисел списка. Для пустого списка верните <code>None</code>.',
  hint:'Сумма делится на длину: <code>sum(nums) / len(nums)</code>. Не забудьте проверить пустой список, иначе будет деление на ноль.',
  tests:['eq(average([2, 4, 6]), 4.0)','eq(average([1]), 1.0)','eq(average([]), None)',
         'close(average([1, 2]), 1.5)'] },

{ n:'Топ-K элементов', tag:'списки', sig:'def top_k(nums, k)', req:['top_k'],
  task:'Напишите функцию <code>top_k(nums, k)</code>, возвращающую <code>k</code> наибольших элементов списка по убыванию. Если элементов меньше, чем <code>k</code>, — верните все. Метод <code>sort()</code> использовать нельзя.',
  hint:'Скопируйте список (<code>list(nums)</code>), отсортируйте копию по убыванию (<code>reverse=True</code>) и возьмите первые <code>k</code>.',
  tests:['eq(top_k([5, 1, 9, 3], 2), [9, 5])','eq(top_k([1, 2], 5), [2, 1])','eq(top_k([], 3), [])',
         'eq(top_k([4, 4, 1], 2), [4, 4])'] },

/* ---------- L8: списки и строки ---------- */
{ n:'Сплющить на уровень', tag:'списки', sig:'def flatten(nested)', req:['flatten'],
  task:'Напишите функцию <code>flatten(nested)</code>, которая превращает список списков в плоский список на <b>один</b> уровень. Вложенные списки второго уровня остаются как есть. Например: <code>flatten([1,[2,3],[4,[5]]]) → [1,2,3,4,[5]]</code>.',
  hint:'Обычный <code>for</code> с добавлением либо генератор списка: <code>[x for el in nested for x in (el if isinstance(el, list) else [el])]</code>.',
  tests:['eq(flatten([1, [2, 3], [4, [5]]]), [1, 2, 3, 4, [5]])','eq(flatten([]), [])',
         'eq(flatten([[1], [2, 3]]), [1, 2, 3])'] },

{ n:'Поэлементная сумма', tag:'списки', sig:'def zip_sum(a, b)', req:['zip_sum'],
  task:'Напишите функцию <code>zip_sum(a, b)</code>, которая складывает элементы двух списков попарно и возвращает новый список. Длина результата равна длине более короткого списка.',
  hint:'Используйте <code>zip(a, b)</code>: он сам остановится на конце короткого списка. Ответ соберите генератором: <code>[x + y for x, y in zip(a, b)]</code>.',
  tests:['eq(zip_sum([1, 2, 3], [10, 20]), [11, 22])','eq(zip_sum([], []), [])',
         'eq(zip_sum([1, 2], [1, 2, 3]), [2, 4])'] },

{ n:'Удалить элемент', tag:'списки', sig:'def remove_item(nums, x)', req:['remove_item'],
  task:'Напишите функцию <code>remove_item(nums, x)</code>, возвращающую <b>новый</b> список без всех вхождений числа <code>x</code>. Исходный список изменять нельзя.',
  hint:'Список-генератор: <code>[v for v in nums if v != x]</code> — он сразу создаёт копию.',
  tests:['eq(remove_item([1, 2, 3, 2], 2), [1, 3])','eq(remove_item([1], 9), [1])','eq(remove_item([], 1), [])',
         'eq(remove_item([1, 1], 1), [])'] },

{ n:'Вставка в отсортированный', tag:'списки', sig:'def insert_sorted(nums, x)', req:['insert_sorted'],
  task:'Напишите функцию <code>insert_sorted(nums, x)</code>, которая вставляет число <code>x</code> в уже отсортированный по возрастанию список, не нарушая порядок, и возвращает новый список. Исходный список не менять.',
  hint:'Найдите первый индекс, где элемент больше <code>x</code> (цикл с <code>break</code>), затем вставьте через срез: <code>nums[:i] + [x] + nums[i:]</code>.',
  tests:['eq(insert_sorted([1, 3, 5], 4), [1, 3, 4, 5])','eq(insert_sorted([], 3), [3])',
         'eq(insert_sorted([1, 3], 1), [1, 1, 3])','eq(insert_sorted([1, 3], 9), [1, 3, 9])'] },

{ n:'Отсортирован ли список?', tag:'списки', sig:'def is_sorted(nums)', req:['is_sorted'],
  task:'Напишите функцию <code>is_sorted(nums)</code>: <code>True</code>, если список отсортирован по неубыванию (каждый следующий элемент не меньше предыдущего). Список из 0 или 1 элемента всегда отсортирован.',
  hint:'Сравните соседние элементы: если хоть раз <code>nums[i] &gt; nums[i+1]</code> — верните <code>False</code>, иначе в конце <code>True</code>.',
  tests:['eq(is_sorted([1, 2, 3]), True)','eq(is_sorted([2, 1]), False)','eq(is_sorted([]), True)',
         'eq(is_sorted([1, 1, 2]), True)','eq(is_sorted([1, 2, 1]), False)'] },

{ n:'Разворот слов', tag:'строки', sig:'def reverse_words(s)', req:['reverse_words'],
  task:'Напишите функцию <code>reverse_words(s)</code>, которая меняет порядок слов в строке на обратный. Пробелы нормализуются до одного, ведущие и завершающие не сохраняются. Например: <code>"раз два три" → "три два раз"</code>.',
  hint:'Разбейте по пробелам, разверните список методом <code>.reverse()</code> (он меняет сам список) и склейте обратно.',
  tests:['eq(reverse_words("раз два три"), "три два раз")','eq(reverse_words("  a  b "), "b a")',
         'eq(reverse_words(""), "")'] },

{ n:'Частотность символов', tag:'словари', sig:'def char_hist(s)', req:['char_hist'],
  task:'Напишите функцию <code>char_hist(s)</code>, возвращающую словарь: ключ — символ строки, значение — сколько раз он встретился. Пустая строка даёт пустой словарь.',
  hint:'Создайте пустой словарь и для каждого символа увеличьте счётчик: <code>d[c] = d.get(c, 0) + 1</code>.',
  tests:['eq(char_hist("aba"), {"a": 2, "b": 1})','eq(char_hist(""), {})','eq(char_hist("ааа"), {"а": 3})'] },

{ n:'camelCase → snake_case', tag:'строки', sig:'def camel_to_snake(name)', req:['camel_to_snake'],
  task:'Напишите функцию <code>camel_to_snake(name)</code>: перед каждой заглавной буквой вставляется подчёркивание, а затем вся строка переводится в нижний регистр. <code>"myVariableName" → "my_variable_name"</code>. Строка без заглавных букв просто переводится в нижний регистр.',
  hint:'Проходите посимвольно: если символ — заглавная буква и это не первый символ, сначала добавляйте <code>"_"</code>. Полезно проверить <code>ch.isupper()</code>.',
  tests:['eq(camel_to_snake("myVariableName"), "my_variable_name")','eq(camel_to_snake("simple"), "simple")',
         'eq(camel_to_snake("oneTwoThree"), "one_two_three")','eq(camel_to_snake(""), "")'] },

{ n:'snake_case → camelCase', tag:'строки', sig:'def snake_to_camel(name)', req:['snake_to_camel'],
  task:'Напишите функцию <code>snake_to_camel(name)</code>: подчёркивания убираются, буква после каждого подчёркивания становится заглавной, остальные — строчными. <code>"my_variable_name" → "myVariableName"</code>.',
  hint:'Разбейте строку по <code>"_"</code>, затем соедините части: первая как есть, остальные с заглавной первой буквой (<code>w.capitalize()</code> или <code>w[0].upper() + w[1:]</code>).',
  tests:['eq(snake_to_camel("my_variable_name"), "myVariableName")','eq(snake_to_camel("one"), "one")',
         'eq(snake_to_camel(""), "")','eq(snake_to_camel("a_b_c"), "aBC")'] },

{ n:'Кумулятивные суммы', tag:'списки', sig:'def prefix_sum(nums)', req:['prefix_sum'],
  task:'Напишите функцию <code>prefix_sum(nums)</code>, возвращающую список накопленных сумм: на позиции <code>i</code> стоит сумма первых <code>i + 1</code> элементов. <code>prefix_sum([1,2,3]) → [1, 3, 6]</code>.',
  hint:'Один проход с накопителем: <code>total += v</code>, затем <code>res.append(total)</code>.',
  tests:['eq(prefix_sum([1, 2, 3]), [1, 3, 6])','eq(prefix_sum([]), [])','eq(prefix_sum([5]), [5])',
         'eq(prefix_sum([-1, 1]), [-1, 0])'] },

/* ---------- L9: словари ---------- */
{ n:'Частотность слов', tag:'словари', sig:'def count_words_dict(s)', req:['count_words_dict'],
  task:'Напишите функцию <code>count_words_dict(s)</code>, возвращающую словарь: слово (в нижнем регистре) → сколько раз оно встретилось в строке.',
  hint:'Сначала разбейте строку по пробелам, приведите слова к нижнему регистру и обновите счётчики через <code>dict.get(word, 0) + 1</code>.',
  tests:['eq(count_words_dict("a b a"), {"a": 2, "b": 1})','eq(count_words_dict(""), {})',
         'eq(count_words_dict("Раз раз РАЗ"), {"раз": 3})'] },

{ n:'Слияние словарей', tag:'словари', sig:'def merge_dicts(a, b)', req:['merge_dicts'],
  task:'Напишите функцию <code>merge_dicts(a, b)</code>, которая возвращает новый словарь: ключи из обоих словарей, а значения для совпадающих ключей <b>складываются</b>. Исходные словари не менять.',
  hint:'Сделайте неглубокую копию через <code>dict(a)</code>, затем пройдитесь по <code>b.items()</code> и прибавьте значения через <code>get</code>.',
  tests:['eq(merge_dicts({"a": 1}, {"b": 2, "a": 3}), {"a": 4, "b": 2})','eq(merge_dicts({}, {}), {})',
         'eq(merge_dicts({"x": 5}, {"y": 1}), {"x": 5, "y": 1})'] },

{ n:'Инвертировать словарь', tag:'словари', sig:'def invert_dict(d)', req:['invert_dict'],
  task:'Напишите функцию <code>invert_dict(d)</code>, меняющую ключи и значения местами. Гарантируется, что значения уникальны.',
  hint:'Обычный цикл: <code>for k, v in d.items(): res[v] = k</code>.',
  tests:['eq(invert_dict({"a": 1, "b": 2}), {1: "a", 2: "b"})','eq(invert_dict({}), {})'] },

{ n:'Ключ-рекордсмен', tag:'словари', sig:'def top_key(d)', req:['top_key'],
  task:'Напишите функцию <code>top_key(d)</code>, возвращающую ключ с наибольшим значением. Для пустого словаря верните <code>None</code>. При равных значениях побеждает ключ, который встретился раньше.',
  hint:'Сохраняйте «лучший» ключ и значение, сравнивайте только строго большее (<code>if v &gt; best_value</code>).',
  tests:['eq(top_key({"a": 1, "b": 5, "c": 3}), "b")','eq(top_key({}), None)','eq(top_key({"x": -1, "y": -5}), "x")'] },

{ n:'Фильтр по значению', tag:'словари', sig:'def filter_by_value(d, threshold)', req:['filter_by_value'],
  task:'Напишите функцию <code>filter_by_value(d, threshold)</code>, возвращающую новый словарь только с теми парами, у которых значение <b>не меньше</b> <code>threshold</code>.',
  hint:'Словарь-генератор: <code>{k: v for k, v in d.items() if v &gt;= threshold}</code>.',
  tests:['eq(filter_by_value({"a": 5, "b": 2, "c": 9}, 5), {"a": 5, "c": 9})',
         'eq(filter_by_value({}, 1), {})',
         'eq(filter_by_value({"a": 1}, 2), {})'] },

{ n:'Словарь из пар', tag:'словари', sig:'def dict_from_pairs(pairs)', req:['dict_from_pairs'],
  task:'Напишите функцию <code>dict_from_pairs(pairs)</code>, превращающую список пар (списков или кортежей из двух элементов) в словарь. Пустой список даёт пустой словарь.',
  hint:'В Python это делает одна строка: <code>dict(pairs)</code>.',
  tests:['eq(dict_from_pairs([("a", 1), ("b", 2)]), {"a": 1, "b": 2})','eq(dict_from_pairs([]), {})',
         'eq(dict_from_pairs([["k", "v"]]), {"k": "v"})'] },

{ n:'Группировка по длине', tag:'словари', sig:'def group_by_len(words)', req:['group_by_len'],
  task:'Напишите функцию <code>group_by_len(words)</code>, возвращающую словарь: длина слова → список слов этой длины в исходном порядке. <code>group_by_len(["a","bb","c"]) → {1: ["a","c"], 2: ["bb"]}</code>.',
  hint:'Создайте пустой словарь со списками на месте или проверяйте наличие ключа: <code>d.setdefault(len(w), []).append(w)</code>.',
  tests:['eq(group_by_len(["a", "bb", "c"]), {1: ["a", "c"], 2: ["bb"]})','eq(group_by_len([]), {})'] },

{ n:'Сумма заказа', tag:'словари', sig:'def order_total(prices, order)', req:['order_total'],
  task:'Напишите функцию <code>order_total(prices, order)</code>. В <code>order</code> лежит количество заказанного товара, в <code>prices</code> — цена за штуку. Верните общую стоимость заказа (целое или дробное число). Товаров, которых нет в заказе, игнорируйте.',
  hint:'Просто умножьте цену на количество и сложите: <code>sum(prices.get(k, 0) * v for k, v in order.items())</code>.',
  tests:['eq(order_total({"apple": 100, "banana": 50}, {"apple": 2, "banana": 1}), 250)',
         'eq(order_total({}, {}), 0)','eq(order_total({"a": 3}, {"a": 0}), 0)'] },

{ n:'Ключи со значением', tag:'словари', sig:'def keys_with_value(d, v)', req:['keys_with_value'],
  task:'Напишите функцию <code>keys_with_value(d, v)</code>, возвращающую список всех ключей, значение которых равно <code>v</code>. Порядок — как в словаре.',
  hint:'Список-генератор: <code>[k for k, val in d.items() if val == v]</code>.',
  tests:['eq(keys_with_value({"a": 1, "b": 2, "c": 1}, 1), ["a", "c"])',
         'eq(keys_with_value({}, 1), [])','eq(keys_with_value({"x": 5}, 5), ["x"])'] },

{ n:'Самая частая буква', tag:'словари', sig:'def most_common_char(s)', req:['most_common_char'],
  task:'Напишите функцию <code>most_common_char(s)</code>, возвращающую кортеж <code>(буква, количество)</code> для самой частой буквы строки. При равенстве количеств побеждает та буква, которая встретилась раньше в строке. Для пустой строки верните <code>("", 0)</code>.',
  hint:'Постройте словарь частот, потом найдите максимум. Удобный способ — <code>max(freq.items(), key=lambda p: p[1])</code>, но следите: <code>dict</code> сохраняет порядок вставки, так что равенство решается корректно.',
  tests:['eq(most_common_char("aabbbc"), ("b", 3))','eq(most_common_char("ab"), ("a", 1))',
         'eq(most_common_char(""), ("", 0))'] },

/* ---------- L10: функции высшего порядка, рекурсия, финал ---------- */
{ n:'Своя map', tag:'функции высшего порядка', sig:'def my_map(nums, f)', req:['my_map'],
  task:'Напишите функцию <code>my_map(nums, f)</code> — аналог встроенной <code>map</code>: возвращает новый список, где каждый элемент <code>nums</code> заменён на результат <code>f(элемент)</code>. <code>f</code> — функция, которая передаётся аргументом.',
  hint:'Список-генератор: <code>[f(x) for x in nums]</code>.',
  tests:['eq(my_map([1, 2, 3], lambda x: x * 2), [2, 4, 6])','eq(my_map([], lambda x: x), [])',
         'eq(my_map([1, 2], lambda x: str(x)), ["1", "2"])'] },

{ n:'Своя filter', tag:'функции высшего порядка', sig:'def my_filter(nums, pred)', req:['my_filter'],
  task:'Напишите функцию <code>my_filter(nums, pred)</code> — аналог встроенной <code>filter</code>: возвращает новый список только из тех элементов, для которых <code>pred(элемент)</code> даёт истину.',
  hint:'<code>[x for x in nums if pred(x)]</code> — условие в генераторе само отбрасывает лишнее.',
  tests:['eq(my_filter([1, 2, 3, 4], lambda x: x % 2 == 0), [2, 4])','eq(my_filter([1, 3], lambda x: x > 5), [])',
         'eq(my_filter([], lambda x: True), [])','eq(my_filter([-2, 0, 5], lambda x: x >= 0), [0, 5])'] },

{ n:'Своё свёртывание', tag:'функции высшего порядка', sig:'def my_reduce(nums, f, initial)', req:['my_reduce'],
  task:'Напишите функцию <code>my_reduce(nums, f, initial)</code> — аналог <code>functools.reduce</code>: начните с <code>initial</code>, затем для каждого элемента вызывайте <code>f(накопленное, элемент)</code> и возвращайте итог.',
  hint:'Обычный цикл с накопителем: <code>acc = initial</code>, затем <code>acc = f(acc, x)</code>.',
  tests:['eq(my_reduce([1, 2, 3], lambda a, b: a + b, 0), 6)','eq(my_reduce([], lambda a, b: a + b, 10), 10)',
         'eq(my_reduce([1, 2, 3, 4], lambda a, b: a + b, 100), 110)'] },

{ n:'Двойное применение', tag:'функции высшего порядка', sig:'def apply_twice(f, x)', req:['apply_twice'],
  task:'Напишите функцию <code>apply_twice(f, x)</code>, которая применяет <code>f</code> к <code>x</code> два раза и возвращает результат: <code>f(f(x))</code>.',
  hint:'Всё в одну строку: <code>return f(f(x))</code>.',
  tests:['eq(apply_twice(lambda x: x + 1, 0), 2)','eq(apply_twice(lambda s: s + "!", "a"), "a!!")',
         'eq(apply_twice(lambda x: x * x, 3), 81)'] },

{ n:'Композиция функций', tag:'функции высшего порядка', sig:'def compose(f, g)', req:['compose'],
  task:'Напишите функцию <code>compose(f, g)</code>, которая возвращает новую функцию <code>h</code>: сначала вычисляется <code>g(x)</code>, затем её результат передаётся в <code>f</code>. То есть <code>h(x) = f(g(x))</code>.',
  hint:'Верните лямбду: <code>return lambda x: f(g(x))</code>. Обратите внимание на порядок вызовов — <code>f</code> выполняется последним.',
  tests:['eq(compose(lambda x: x * 2, lambda x: x + 1)(5), 12)',
         'eq(compose(str, len)("привет"), "6")',
         'eq(compose(lambda x: x - 25, lambda x: x * 10)(3), 5)',
         'eq(compose(lambda x: x.upper(), lambda x: "ab")(1), "AB")'] },

{ n:'Степень рекурсивно', tag:'рекурсия', sig:'def power_rec(a, n)', req:['power_rec'],
  task:'Напишите функцию <code>power_rec(a, n)</code>, вычисляющую <code>a</code> в степени <code>n</code> <b>без оператора <code>**</code> и без умножения</b>, только рекурсией.',
  hint:'Базовый случай: <code>n == 0</code> → 1. Дальше <code>a * power_rec(a, n - 1)</code>. Не забудьте про базу для <code>n &lt; 0</code>, если хотите её поддержать.',
  tests:['eq(power_rec(2, 10), 1024)','eq(power_rec(5, 0), 1)','eq(power_rec(-2, 3), -8)'] },

{ n:'НОД рекурсивно', tag:'рекурсия', sig:'def gcd_rec(a, b)', req:['gcd_rec'],
  task:'Напишите функцию <code>gcd_rec(a, b)</code>, находящую наибольший общий делитель рекурсивно, без циклов. Используйте алгоритм Евклида: <code>gcd(a, b) = gcd(b, a % b)</code>, а база — <code>b == 0</code>.',
  hint:'Если <code>b == 0</code>, верните <code>a</code>. Иначе верните <code>gcd_rec(b, a % b)</code>.',
  tests:['eq(gcd_rec(12, 18), 6)','eq(gcd_rec(7, 13), 1)','eq(gcd_rec(0, 5), 5)','eq(gcd_rec(100, 75), 25)'] },

{ n:'Сплющить полностью', tag:'рекурсия', sig:'def flatten_deep(nested)', req:['flatten_deep'],
  task:'Напишите функцию <code>flatten_deep(nested)</code>, которая превращает список любой вложенности в плоский список, рекурсивно. <code>flatten_deep([1,[2,[3,[4]]]]) → [1,2,3,4]</code>.',
  hint:'Разберитесь, когда элемент <code>isinstance(x, list)</code>: если да — рекурсивно разворачивайте и добавляйте результат по частям (<code>res.extend(...)</code>), иначе добавляйте сам элемент.',
  tests:['eq(flatten_deep([1, [2, [3, [4]]]]), [1, 2, 3, 4])','eq(flatten_deep([]), [])',
         'eq(flatten_deep([[1], [[2]], [[[3]]]]), [1, 2, 3])','eq(flatten_deep([1, 2, 3]), [1, 2, 3])'] },

{ n:'Проверка e-mail', tag:'строки', sig:'def is_valid_email(s)', req:['is_valid_email'],
  task:'Напишите функцию <code>is_valid_email(s)</code>: строка считается e-mail, если в ней ровно один символ <code>@</code>, перед ним непустой блок без пробелов и <code>@</code>, а после него — непустой блок с хотя бы одной точкой, не в начале и не в конце.',
  hint:'Разбейте строку по <code>"@"</code> через <code>s.split("@")</code>: если частей не 2 — сразу <code>False</code>. Дальше проверьте части и точку в домене.',
  tests:['eq(is_valid_email("user@example.com"), True)','eq(is_valid_email("a.b+c@mail.ru"), True)',
         'eq(is_valid_email("bad@"), False)','eq(is_valid_email("no-at.com"), False)',
         'eq(is_valid_email("a@b@c.com"), False)','eq(is_valid_email("a@.com"), False)',
         'eq(is_valid_email("a@b."), False)','eq(is_valid_email("@b.com"), False)'] },

{ n:'[ФИНАЛ] Отчёт по тексту', tag:'итоговое', sig:'def text_report(text)', req:['text_report'],
  task:'Финальное задание. Напишите функцию <code>text_report(text)</code>, возвращающую словарь ровно с четырьмя ключами:\n• <code>"chars"</code> — длина строки без ведущих и конечных пробелов\n• <code>"words"</code> — количество слов\n• <code>"unique"</code> — количество различных слов\n• <code>"longest"</code> — самое длинное слово (первое при равенстве), для пустой строки <code>""</code>',
  hint:'Соберите всё вместе: <code>stripped = text.strip()</code>, <code>words = stripped.split()</code>, <code>set(words)</code> для уникальных и цикл для самого длинного слова. Не забудьте, что в пустой строке <code>split()</code> даёт <code>[]</code>, а самое длинное слово надо взять по умолчанию.',
  tests:['eq(text_report("раз два"), {"chars": 7, "words": 2, "unique": 2, "longest": "раз"})',
         'eq(text_report(""), {"chars": 0, "words": 0, "unique": 0, "longest": ""})',
         'eq(text_report("  a bb ccc  "), {"chars": 8, "words": 3, "unique": 3, "longest": "ccc"})',
         'eq(text_report("раз раз два"), {"chars": 11, "words": 3, "unique": 2, "longest": "раз"})'] }
];

/* ===================== 1b. ЭТАЛОННЫЕ РЕШЕНИЯ ============================
   Написаны вручную, по одной штуке на каждую задачу банка, в том же порядке.
   Используются для кнопки «Показать решение» и служат эталоном: на них
   должны проходить все тесты. Индекс REFS[i] соответствует задаче i + 1.
   ======================================================================== */
const REFS = [
`def hello():
    return "Привет, мир!"`,

`def greet(name):
    return "Привет, " + name + "!"`,

`def add(a, b):
    return a + b`,

`def sub(a, b):
    return a - b`,

`def mul(a, b):
    return a * b`,

`def div(a, b):
    return a / b`,

`def int_div(a, b):
    return a // b`,

`def mod(a, b):
    return a % b`,

`def power(a, n):
    return a ** n`,

`def abs_value(x):
    return x if x >= 0 else -x`,

`def max2(a, b):
    return a if a > b else b`,

`def min2(a, b):
    return a if a < b else b`,

`def square(x):
    return x * x`,

`def area(w, h):
    return w * h`,

`def perimeter(a, b):
    return (a + b) * 2`,

`def celsius_to_f(c):
    return 9 * c / 5 + 32`,

`def fahrenheit_to_c(f):
    return 5 * (f - 32) / 9`,

`def seconds_to_hms(s):
    m = s // 60
    return f"{m // 60}:{m % 60:02d}:{s % 60:02d}"`,

`def days_in_month(year, month):
    days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    leap = year % 400 == 0 or (year % 4 == 0 and year % 100 != 0)
    if month == 2 and leap:
        return 29
    return days[month - 1]`,

`a = int(input())
op = input().strip()
b = int(input())
if op == "+":
    print(a + b)
elif op == "-":
    print(a - b)
elif op == "*":
    print(a * b)
else:
    print(a / b)`,

`def len_str(s):
    return len(s)`,

`def upper(s):
    return s.upper()`,

`def lower(s):
    return s.lower()`,

`def strip(s):
    return s.strip()`,

`def reverse(s):
    return s[::-1]`,

`def count_char(s, ch):
    return s.count(ch)`,

`def first_last(s):
    return (s[0], s[-1])`,

`def middle_char(s):
    return s[len(s) // 2]`,

`def is_palindrome(s):
    t = s.lower().replace(" ", "")
    return t == t[::-1]`,

`def replace_all(s, a, b):
    return s.replace(a, b)`,

`def title_case(s):
    return s.title()`,

`def is_digits(s):
    return len(s) > 0 and s.isdigit()`,

`def starts_with(s, p):
    return s.startswith(p)`,

`def ends_with(s, p):
    return s.endswith(p)`,

`def split_words(s):
    return s.split()`,

`def join_words(words, sep):
    return sep.join(words)`,

`def first_n(s, n):
    return s[:n]`,

`def remove_spaces(s):
    return s.replace(" ", "")`,

`def count_words(s):
    return len(s.split())`,

`def longest_word(s):
    best = ""
    for w in s.split():
        if len(w) > len(best):
            best = w
    return best`,

`def is_even(n):
    return n % 2 == 0`,

`def is_odd(n):
    return n % 2 == 1`,

`def sign(x):
    if x > 0:
        return 1
    if x < 0:
        return -1
    return 0`,

`def is_leap_year(year):
    return year % 400 == 0 or (year % 4 == 0 and year % 100 != 0)`,

`def max_of_three(a, b, c):
    m = a
    if b > m:
        m = b
    if c > m:
        m = c
    return m`,

`n = int(input())
if n % 15 == 0:
    print("FizzBuzz")
elif n % 3 == 0:
    print("Fizz")
elif n % 5 == 0:
    print("Buzz")
else:
    print(n)`,

`def grade(score):
    if score >= 90:
        return "отлично"
    elif score >= 70:
        return "хорошо"
    elif score >= 50:
        return "удовлетворительно"
    return "неудовлетворительно"`,

`def both_even(a, b):
    return a % 2 == 0 and b % 2 == 0`,

`def triangle_type(a, b, c):
    s = sorted([a, b, c])
    if s[0] + s[1] <= s[2]:
        return "невозможный"
    if s[0] == s[2]:
        return "равносторонний"
    if s[0] == s[1] or s[1] == s[2]:
        return "равнобедренный"
    return "разносторонний"`,

`def in_range(n, a, b):
    return a <= n <= b`,

`def sum_to_n(n):
    return n * (n + 1) // 2`,

`def factorial(n):
    r = 1
    for i in range(1, n + 1):
        r *= i
    return r`,

`def sum_digits(n):
    return sum(int(c) for c in str(abs(n)))`,

`def reverse_number(n):
    r = int(str(abs(n))[::-1])
    return -r if n < 0 else r`,

`def count_digits(n):
    return len(str(abs(n)))`,

`def is_prime(n):
    if n < 2:
        return False
    for i in range(2, int(n ** 0.5) + 1):
        if n % i == 0:
            return False
    return True`,

`def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a`,

`def gcd(a, b):
    while b:
        a, b = b, a % b
    return a`,

`def lcm(a, b):
    def gcd(x, y):
        while y:
            x, y = y, x % y
        return x
    return (a // gcd(a, b)) * b`,

`def sum_even(nums):
    total = 0
    for x in nums:
        if x % 2 == 0:
            total += x
    return total`,

`def max_of_list(nums):
    if not nums:
        return None
    best = nums[0]
    for x in nums:
        if x > best:
            best = x
    return best`,

`def min_of_list(nums):
    if not nums:
        return None
    best = nums[0]
    for x in nums:
        if x < best:
            best = x
    return best`,

`def find_index(nums, x):
    for i, v in enumerate(nums):
        if v == x:
            return i
    return -1`,

`def has_duplicate(nums):
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] == nums[j]:
                return True
    return False`,

`def unique(nums):
    res = []
    for x in nums:
        if x not in res:
            res.append(x)
    return res`,

`def merge_sorted(a, b):
    res = []
    i = j = 0
    while i < len(a) and j < len(b):
        if a[i] <= b[j]:
            res.append(a[i])
            i += 1
        else:
            res.append(b[j])
            j += 1
    res += a[i:]
    res += b[j:]
    return res`,

`def rotate(nums, k):
    if not nums:
        return []
    k = k % len(nums)
    return nums[k:] + nums[:k]`,

`def chunk(nums, k):
    return [nums[i:i + k] for i in range(0, len(nums), k)]`,

`def average(nums):
    if not nums:
        return None
    return sum(nums) / len(nums)`,

`def top_k(nums, k):
    return sorted(nums, reverse=True)[:k]`,

`def flatten(nested):
    res = []
    for el in nested:
        if isinstance(el, list):
            res.extend(el)
        else:
            res.append(el)
    return res`,

`def zip_sum(a, b):
    return [x + y for x, y in zip(a, b)]`,

`def remove_item(nums, x):
    return [v for v in nums if v != x]`,

`def insert_sorted(nums, x):
    for i, v in enumerate(nums):
        if v > x:
            return nums[:i] + [x] + nums[i:]
    return list(nums) + [x]`,

`def is_sorted(nums):
    for i in range(len(nums) - 1):
        if nums[i] > nums[i + 1]:
            return False
    return True`,

`def reverse_words(s):
    w = s.split()
    w.reverse()
    return " ".join(w)`,

`def char_hist(s):
    d = {}
    for c in s:
        d[c] = d.get(c, 0) + 1
    return d`,

`def camel_to_snake(name):
    out = ""
    for i, ch in enumerate(name):
        if i > 0 and ch.isupper():
            out += "_"
        out += ch.lower()
    return out`,

`def snake_to_camel(name):
    parts = name.split("_")
    tail = [w[:1].upper() + w[1:] for w in parts[1:]]
    return parts[0] + "".join(tail)`,

`def prefix_sum(nums):
    total = 0
    res = []
    for v in nums:
        total += v
        res.append(total)
    return res`,

`def count_words_dict(s):
    d = {}
    for w in s.lower().split():
        d[w] = d.get(w, 0) + 1
    return d`,

`def merge_dicts(a, b):
    res = dict(a)
    for k, v in b.items():
        res[k] = res.get(k, 0) + v
    return res`,

`def invert_dict(d):
    res = {}
    for k, v in d.items():
        res[v] = k
    return res`,

`def top_key(d):
    best_key = None
    best_val = None
    for k, v in d.items():
        if best_val is None or v > best_val:
            best_key = k
            best_val = v
    return best_key`,

`def filter_by_value(d, threshold):
    return {k: v for k, v in d.items() if v >= threshold}`,

`def dict_from_pairs(pairs):
    return dict(pairs)`,

`def group_by_len(words):
    d = {}
    for w in words:
        d.setdefault(len(w), []).append(w)
    return d`,

`def order_total(prices, order):
    return sum(prices.get(k, 0) * v for k, v in order.items())`,

`def keys_with_value(d, v):
    return [k for k, val in d.items() if val == v]`,

`def most_common_char(s):
    if not s:
        return ("", 0)
    freq = {}
    for c in s:
        freq[c] = freq.get(c, 0) + 1
    ch, cnt = max(freq.items(), key=lambda p: p[1])
    return (ch, cnt)`,

`def my_map(nums, f):
    return [f(x) for x in nums]`,

`def my_filter(nums, pred):
    return [x for x in nums if pred(x)]`,

`def my_reduce(nums, f, initial):
    acc = initial
    for x in nums:
        acc = f(acc, x)
    return acc`,

`def apply_twice(f, x):
    return f(f(x))`,

`def compose(f, g):
    return lambda x: f(g(x))`,

`def power_rec(a, n):
    if n == 0:
        return 1
    return a * power_rec(a, n - 1)`,

`def gcd_rec(a, b):
    if b == 0:
        return a
    return gcd_rec(b, a % b)`,

`def flatten_deep(nested):
    res = []
    for x in nested:
        if isinstance(x, list):
            res.extend(flatten_deep(x))
        else:
            res.append(x)
    return res`,

`def is_valid_email(s):
    parts = s.split("@")
    if len(parts) != 2:
        return False
    local, domain = parts
    if not local or " " in local:
        return False
    if not domain or domain.startswith(".") or domain.endswith("."):
        return False
    return "." in domain`,

`def text_report(text):
    stripped = text.strip()
    words = stripped.split()
    longest = ""
    for w in words:
        if len(w) > len(longest):
            longest = w
    return {
        "chars": len(stripped),
        "words": len(words),
        "unique": len(set(words)),
        "longest": longest,
    }`
];

/* нормализация банка */
TASKS.forEach((t, i) => {
  t.id = i + 1;
  t.lv = Math.ceil((i + 1) / 10);
  t.tests = t.tests.map(x => (typeof x === 'string' ? { code: x } : x));
  t.sol = (REFS[i] || '').trim();
});
if (REFS.length !== TASKS.length) console.warn('[neopy] решений в REFS:', REFS.length, 'задач:', TASKS.length);
const TOTAL = TASKS.length;
const LV_NAMES = {
  1:'цифры и первые функции', 2:'арифметика и консоль', 3:'строки', 4:'строки и текст',
  5:'условия', 6:'циклы', 7:'списки', 8:'списки и строки', 9:'словари', 10:'функции, рекурсия, финал'
};

/* ===================== 2. PROFILES / LOCAL STORE ========================= */
const LS = {
  users: 'neopy.v1.users',
  last:  'neopy.v1.lastNick',
  read(key, def) { try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; } },
  write(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
};

/* Проверка, разрешено ли браузеру хранить данные. Иначе прогресс тихо
   исчезал бы при закрытии вкладки — предупреждаем заранее. */
function lsAvailable() {
  try {
    const k = '__neopy_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch { return false; }
}
const STAT_ZERO = () => ({ runs: 0, checks: 0, hints: 0, reveals: 0, timeMs: 0, streak: 0, best: 0 });

function blankProfile(nick) {
  return { nick, created: nowMs(), seen: nowMs(), current: 1, code: {}, solved: {}, stats: STAT_ZERO(), seenIntro: false };
}
let P = null;                       // текущий профиль
function keyOf(nick) { return String(nick).trim().replace(/\s+/g, ' ').toLowerCase(); }
function loadProfile(nick) {
  const all = LS.read(LS.users, {});
  const k = keyOf(nick);
  if (!all[k]) { all[k] = blankProfile(String(nick).trim().replace(/\s+/g, ' ')); LS.write(LS.users, all); }
  all[k].seen = nowMs();
  const fresh = blankProfile(all[k].nick);
  const p = Object.assign(fresh, all[k]);
  p.stats = Object.assign(STAT_ZERO(), all[k].stats || {});
  LS.write(LS.users, Object.assign(all, { [k]: p }));
  return p;
}
function saveProfile() {
  if (!P) return;
  const all = LS.read(LS.users, {});
  all[keyOf(P.nick)] = P;
  LS.write(LS.users, all);
}
const solvedIds = () => Object.keys(P.solved).map(Number);
function firstUnsolved() {
  for (let i = 1; i <= TOTAL; i++) if (!P.solved[i]) return i;
  return TOTAL;
}
function isUnlocked(id) { return id <= firstUnsolved(); }
const solvedCount = () => Object.keys(P.solved).length;
function rankOf(n) {
  if (n >= TOTAL) return ['ЛЕГЕНДА НЕТРУННЕЙДА', 'ЗОЛОТОЙ ИМПЕРАТОР'];
  if (n >= 75) return ['ТЕНЕВОЙ АРХИТЕКТОР', 'RANK 9'];
  if (n >= 50) return ['КИБЕР-ПИТОН', 'RANK 7'];
  if (n >= 25) return ['ДЖУН-ХАКЕР', 'RANK 5'];
  if (n >= 10) return ['СКРИПТ-КИД', 'RANK 3'];
  if (n > 0)   return ['НОВОИСПЕЧНЕННЫЙ', 'RANK 1'];
  return ['НИКТО', 'RANK 0'];
}

/* ======================= 3. AUTH GATE =================================== */
const authScreen = $('#authScreen'), loginInput = $('#loginInput');
const authLast = $('#authLast'), btnUseLast = $('#btnUseLast'), authError = $('#authError');
const authProfiles = $('#authProfiles'), apList = $('#apList');

const SYLL = ['neo','byte','ghost','volt','nyx','zero','hex','kairo','delta','viper','glitch','storm',
              'rx','quantum','null','echo','flux','onyx','zeta','neon','chrome','shard','pulse','wraith'];

function renderAuth() {
  if (!lsAvailable()) $('#lsNotice').hidden = false;
  const last = LS.read(LS.last, '');
  if (last) {
    authLast.hidden = false;
    btnUseLast.textContent = last;
    loginInput.value = last;
  }
  const all = LS.read(LS.users, {});
  const nicks = Object.values(all);
  if (nicks.length) {
    authProfiles.hidden = false;
    apList.innerHTML = nicks.sort((a, b) => b.seen - a.seen).map(p =>
      `<button type="button" class="ap-btn" data-nick="${esc(p.nick)}">${esc(p.nick)}<small>${Object.keys(p.solved || {}).length}/${TOTAL}</small></button>`
    ).join('');
    $$('.ap-btn', apList).forEach(b => b.addEventListener('click', () => {
      loginInput.value = b.dataset.nick; loginInput.focus(); authError.hidden = true;
    }));
  }
}

function enterApp(nick) {
  P = loadProfile(nick);
  LS.write(LS.last, P.nick);
  authScreen.hidden = true;
  $('#userNick').textContent = P.nick;
  $('#userAvatar').textContent = (P.nick[0] || '?').toUpperCase();
  sysMsg(`Оператор <b>${esc(P.nick)}</b> на связи. Профиль загружен из локального хранилища: решено ${solvedCount()}/${TOTAL}. Данные никуда не передаются.`);
  renderAll();
  openTask(P.current && P.solved[P.current] ? firstUnsolved() : (P.current || firstUnsolved()), false);
  ensurePyodide();
  /* первый вход в профиль — сразу показываем, что делать дальше,
     иначе новый человек просто не понимает, куда нажать */
  if (!P.seenIntro) { openIntro(); }
  else { focusEditor(); }
}

/* Окно-инструкция. Показывается один раз на профиль и по кнопке справа. */
function openIntro() {
  const m = $('#introModal');
  m.hidden = false;
  if (P) { P.seenIntro = true; saveProfile(); }
  $('#btnIntroGo').focus();
}
function closeIntro() { $('#introModal').hidden = true; focusEditor(); }

/* Курсор в редактор: писать код можно сразу, без поиска кнопок. */
function focusEditor() {
  try { editor.focus(); } catch {}
}

/* Шпаргалка над редактором нужна, пока мало решено, — дальше она мешает. */
function renderFirstSteps() {
  $('#firstSteps').hidden = solvedCount() >= 3;
}

$('#authForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = loginInput.value.trim();
  if (!v) {
    authError.hidden = false;
    $('.auth-input-wrap').classList.add('bad');
    setTimeout(() => $('.auth-input-wrap').classList.remove('bad'), 350);
    return;
  }
  /* сбой входа не должен выглядеть как «ничего не произошло» */
  try {
    enterApp(v);
    authError.hidden = true;
    $('#fatalBox').hidden = true;
  } catch (err) {
    fatal('вход не выполнен: ' + (err && err.message ? err.message : err));
    authError.hidden = false;
    authError.textContent = '// ОШИБКА ВХОДА: ' + (err && err.message ? err.message : err);
  }
});
loginInput.addEventListener('input', () => { authError.hidden = true; });
$('#btnRandNick').addEventListener('click', () => {
  const pick = SYLL[Math.floor(Math.random() * SYLL.length)];
  loginInput.value = pick.toUpperCase() + '-' + Math.floor(10 + Math.random() * 90);
  loginInput.focus();
});
btnUseLast.addEventListener('click', () => {
  const last = LS.read(LS.last, '');
  if (last) { loginInput.value = last; loginInput.focus(); }
});

/* переключение профиля */
function logout() {
  saveProfile();
  P = null;
  $('#profileModal').hidden = true;
  authScreen.hidden = false;
  loginInput.value = LS.read(LS.last, '');
  authLast.hidden = !loginInput.value;
  renderAuth();          // список профилей мог измениться (появились новые)
  loginInput.focus();
}
$('#btnUser').addEventListener('click', openProfile);
$('#btnCloseProfile').addEventListener('click', () => $('#profileModal').hidden = true);

/* инструкция: одна кнопка — «понятно», ESC — закрыть, справа в журнале — перечитать */
$('#btnIntroGo').addEventListener('click', closeIntro);
$('#btnIntroX').addEventListener('click', closeIntro);
$('#btnHelp').addEventListener('click', openIntro);
$('#btnSwitchUser').addEventListener('click', logout);
$('#profileModal').addEventListener('click', e => { if (e.target.id === 'profileModal') e.currentTarget.hidden = true; });

function openProfile() {
  if (!P) return;
  const n = solvedCount();
  const [rankName, rankTag] = rankOf(n);
  $('#pAvatar').textContent = (P.nick[0] || '?').toUpperCase();
  $('#pNick').textContent = P.nick;
  $('#pRank').textContent = `${rankName} // ${rankTag}`;
  $('#pSolved').textContent = n;
  $('#pAttempts').textContent = P.stats.runs;
  $('#pChecks').textContent = P.stats.checks;
  $('#pStreak').textContent = P.stats.streak;
  $('#pLevel').textContent = Math.min(10, Math.ceil(Math.max(firstUnsolved(), 1) / 10));
  $('#pTime').textContent = fmtDuration(P.stats.timeMs + (nowMs() - sessionStart));
  $('#pCreated').textContent = fmtDate(P.created);
  $('#pSeen').textContent = fmtDate(P.seen);
  $('#pHints').textContent = P.stats.hints || 0;
  $('#pRefs').textContent = P.stats.reveals || 0;
  $('#profileModal').hidden = false;
}
$('#btnExport').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(P, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `neopy-profile-${keyOf(P.nick)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Профиль выгружен в файл .json', 'ok');
});
$('#btnWipe').addEventListener('click', () => {
  if (!confirm(`Стереть весь прогресс и код оператора «${P.nick}»? Действие необратимо.`)) return;
  P.code = {}; P.solved = {}; P.stats = STAT_ZERO();
  P.current = 1; saveProfile(); renderAll(); openTask(1);
  $('#profileModal').hidden = true;
  toast('Прогресс стёрт', 'warn');
});
$('#btnReset').addEventListener('click', () => {
  if (!P) return;
  if (!confirm('Сбросить прогресс текущего оператора?')) return;
  P.code = {}; P.solved = {}; P.stats = STAT_ZERO();
  P.current = 1; saveProfile(); renderAll(); openTask(1); toast('Прогресс сброшен', 'warn');
});

/* ======================= 4. PYTHON CORE (Pyodide) ========================
   Ядро — настоящий интерпретатор Python 3.12 (Pyodide), который исполняется
   прямо на этой странице. Сайт открывается двойным щелчком по файлу:
   никакого сервера, никакой установки, ничего не запускать не нужно.

   Известное ограничение такого способа: код исполняется в главном потоке,
   поэтому цикл без выхода (`while True:` без `break`) заморозит вкладку, и
   остановить его будет нечем. Поэтому перед запуском всегда стоит
   «ПРОВЕРКА» — она ловит такой цикл по тексту кода, ничего не выполняя,
   а «ЗАПУСК» дополнительно отказывается запускать подозрительный код.
   ======================================================================== */
let pyState = 'loading';          // loading | ready | error | running
let py = null;                    // экземпляр Pyodide
let pyBooting = false;
const coreStatus = $('#coreStatus');

function setCore(state, text) {
  pyState = state;
  coreStatus.className = 'core-status ' + (state === 'ready' ? 'ready' : state === 'error' ? 'error' : state === 'running' ? 'busy' : '');
  $('#coreStatus .core-text').textContent = 'ядро: ' + text;
}

const PYODIDE_VERSION = '0.27.7';
const PYODIDE_INDEX = 'https://cdn.jsdelivr.net/pyodide/v' + PYODIDE_VERSION + '/full/';

async function ensurePyodide() {
  if (py || pyState === 'error' || pyBooting) return;
  pyBooting = true;
  setCore('loading', 'загрузка ядра…');
  try {
    if (typeof loadPyodide !== 'function') throw new Error('скрипт Pyodide не загрузился с CDN');
    py = await loadPyodide({ indexURL: PYODIDE_INDEX });
    py.runPython(PY_DRIVER);
    setCore('ready', 'python 3.12 online');
    sysMsg('Python-ядро <b>Pyodide</b> загружено: код исполняется настоящим интерпретатором Python 3.12 прямо на этой странице. Ничего не уходит в интернет.');
  } catch (e) {
    py = null;
    setCore('error', 'нет ядра — офлайн-режим');
    sysMsg('⚠ Ядро не загрузилось: ' + esc(e && e.message || e) +
      '. Нужен интернет только для первой загрузки ядра. «ПРОВЕРКА», подсказки и эталоны доступны всегда.');
    console.warn('[neopy] core load failed:', e);
  } finally {
    pyBooting = false;
  }
}

/* Ждём, пока ядро поднимется: сразу после входа его ещё нет,
   и «ЗАПУСК» не должен падать с «ядро недоступно». */
function pyWaitReady(timeoutMs = 180000) {
  return new Promise((resolve) => {
    const settled = () => pyState === 'ready' || pyState === 'error';
    if (settled()) return resolve(pyState === 'ready');
    const iv = setInterval(() => { if (settled()) { clearInterval(iv); clearTimeout(t); resolve(pyState === 'ready'); } }, 120);
    const t = setTimeout(() => { clearInterval(iv); resolve(false); }, timeoutMs);
  });
}

/* Единая точка запроса к ядру. Прежде чем что-то делать, дожидаемся
   готовности ядра — сразу после входа его ещё нет. */
async function pyRequest(type, payload) {
  if (!py) {
    const ok = await pyWaitReady();
    if (!ok) return { type: 'error', msg: 'ядро не загрузилось — дождись статуса в шапке или нажми «ПРОВЕРКА»' };
  }
  const g = py.globals;
  try {
    if (type === 'syntax') {
      let raw = null;
      try {
        g.set('__code__', payload.code);
        raw = py.runPython('__import__("json").dumps(_syntax_check(__code__) or {})');
      } catch { raw = null; }
      return { type: 'syntax', raw };
    }
    if (type === 'run') {
      g.set('__code__', payload.code);
      g.set('__payload__', payload.payload);
      const out = await py.runPythonAsync('run_tests(__code__, __payload__)');
      return { type: 'result', out };
    }
    return { type: 'error', msg: 'неизвестный запрос ядру: ' + type };
  } catch (err) {
    return { type: 'error', msg: String(err) };
  }
}

/* ---- драйвер исполнения (Python) ---- */
const PY_HELPERS = `
def eq(actual, expected, note=""):
    if actual != expected:
        raise AssertionError("ожидалось: " + repr(expected) + "  |  получено: " + repr(actual) + ("   //  " + note if note else ""))
    return True

def close(actual, expected, note="", eps=1e-6):
    if abs(float(actual) - float(expected)) > eps:
        raise AssertionError("ожидалось ~" + repr(expected) + "  |  получено: " + repr(actual) + ("   //  " + note if note else ""))
    return True

def truthy(value, note=""):
    if not value:
        raise AssertionError("условие не выполнено, значение: " + repr(value) + ("   //  " + note if note else ""))
    return True

def raises(exc, fn, note=""):
    try:
        fn()
    except exc:
        return True
    except Exception as e:
        raise AssertionError("ожидалось исключение " + exc.__name__ + ", получено " + type(e).__name__ + ": " + str(e))
    raise AssertionError("ожидалось исключение " + exc.__name__ + ", но оно не было выброшено" + ("   //  " + note if note else ""))

def out_eq(expected, note="", code=""):
    if code:
        exec(compile(code, "snippet", "exec"), globals())
    out = _OUT.getvalue()
    lines = [ln.rstrip() for ln in out.splitlines() if ln.strip()]
    exp = expected.strip()
    ok = (out.strip() == exp) or (len(lines) == 1 and lines[0] == exp)
    if not ok:
        shown = out.strip() if out.strip() else "(пусто)"
        raise AssertionError("вывод не совпал" + ("   //  " + note if note else "")
            + chr(10) + "ожидалось: " + exp + chr(10) + "получено:  " + shown)
    return True
`;

const PY_DRIVER = `
import io, sys, builtins, json, traceback

_HELPER_SRC = ${JSON.stringify(PY_HELPERS)}

def _syntax_check(code):
    try:
        compile(code, "user.py", "exec")
        return None
    except SyntaxError as e:
        return {"type": "SyntaxError", "msg": e.msg or "ошибка синтаксиса",
                "line": e.lineno, "offset": e.offset,
                "text": (e.text or "").rstrip()}
    except Exception as e:
        return {"type": type(e).__name__, "msg": str(e), "line": None, "offset": None, "text": ""}

def _user_line(tb):
    for fr in reversed(tb):
        if fr.filename == "user.py":
            return fr.lineno
    return None

def run_tests(code, payload):
    data = json.loads(payload)
    tests = data.get("tests") or []
    res = {"syntax": _syntax_check(code), "tests": [], "ok": False}
    if res["syntax"]:
        return json.dumps(res, ensure_ascii=False)
    for t in tests:
        item = {"note": t.get("note", ""), "ok": False, "kind": "", "msg": "", "etype": "",
                "line": None, "stdout": ""}
        buf = io.StringIO()
        old_out, old_in = sys.stdout, builtins.input
        sin = io.StringIO(t.get("stdin") or "")
        sys.stdout = buf
        builtins.input = lambda *a, **k: sin.readline().rstrip(chr(10))
        ns = {"__name__": "__user__", "__builtins__": builtins, "_OUT": buf}
        try:
            exec(_HELPER_SRC, ns)
            exec(compile(code, "user.py", "exec"), ns)
            exec(compile(t.get("code") or "", "test.py", "exec"), ns)
            item["ok"] = True
        except AssertionError as e:
            item["kind"] = "assert"; item["msg"] = str(e); item["line"] = _user_line(traceback.extract_tb(sys.exc_info()[2]))
        except SyntaxError as e:
            item["kind"] = "syntax"; item["msg"] = e.msg or "ошибка синтаксиса"; item["line"] = e.lineno
        except BaseException as e:
            item["kind"] = "runtime"; item["etype"] = type(e).__name__
            item["msg"] = str(e) or "выполнение прервано"
            item["line"] = _user_line(traceback.extract_tb(sys.exc_info()[2]))
        finally:
            sys.stdout = old_out
            builtins.input = old_in
        item["stdout"] = buf.getvalue()
        res["tests"].append(item)
    res["ok"] = bool(res["tests"]) and all(i["ok"] for i in res["tests"])
    return json.dumps(res, ensure_ascii=False)
`;

/* Проверка синтаксиса реальным компилятором (без запуска тестов). */
async function pySyntaxOnly(code) {
  const res = await pyRequest('syntax', { code });
  if (res.type !== 'syntax' || !res.raw) return null;
  try {
    const obj = JSON.parse(res.raw);
    return obj && obj.type ? obj : null;
  } catch { return null; }
}

/* Полный прогон тестов. */
async function pyRunTests(code, tests) {
  setCore('running', 'выполнение…');
  const res = await pyRequest('run', { code, payload: JSON.stringify({ tests }) });
  if (res.type === 'error') return { data: null, error: res.msg };
  if (res.type !== 'result') return { data: null, error: 'ядро не ответило (' + res.type + ')' };
  if (pyState === 'running') setCore('ready', 'python 3.12 online');
  try { return { data: JSON.parse(res.out) }; }
  catch (e) { return { data: null, error: 'не удалось разобрать результат: ' + e.message }; }
}

/* ===================== 5. STATIC ANALYZER (ПРОВЕРКА) ===================== */
const PY_KEYWORDS = ['def','return','if','elif','else','for','while','in','not','and','or','is','None','True','False','import','from','class','try','except','finally','with','as','lambda','pass','break','continue','raise','yield','global','assert','del'];

function stripPy(code) {
  let out = '', inStr = null, i = 0;
  while (i < code.length) {
    const c = code[i], n = code[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') { out += n || ''; i += 2; continue; }
      if (c === inStr) inStr = null;
      i++; continue;
    }
    if (c === '#') { while (i < code.length && code[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '"' || c === "'") { inStr = c; out += c; i++; continue; }
    if (c === '/' && n === '/') { while (i < code.length && code[i] !== '\n') { out += ' '; i++; } continue; }
    out += c; i++;
  }
  return out;
}
function findDefs(code) {
  const names = [];
  const re = /^[ \t]*def[ \t]+([A-Za-z_][A-Za-z_0-9]*)/gm;
  let m;
  while ((m = re.exec(code))) names.push(m[1]);
  return names;
}
function findCalls(code) {
  const names = [];
  const re = /([A-Za-z_][A-Za-z_0-9]*)[ \t]*\(/g;
  let m;
  while ((m = re.exec(code))) names.push(m[1]);
  return [...new Set(names)];
}
function bracketBalance(code) {
  const clean = stripPy(code.replace(/('''|""")[\s\S]*?\1/g, ''));
  const st = [], pairs = { ')': '(', ']': '[', '}': '{' };
  let inStr = null;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inStr) { if (c === '\\') { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if ('([{'.includes(c)) st.push(c);
    else if (')]}'.includes(c)) {
      if (!st.length) return { ok: false, msg: 'лишняя закрывающая скобка «' + c + '»' };
      if (st.pop() !== pairs[c]) return { ok: false, msg: 'скобки расставлены неверно: не сходится «' + c + '»' };
    }
  }
  if (st.length) return { ok: false, msg: 'не закрыта скобка «' + st[st.length - 1] + '»' };
  return { ok: true };
}

/** статический разбор кода (async: синтаксис подтверждается настоящим компилятором) */
async function analyze(task) {
  const code = editor.value;
  const res = { errs: [], warns: [], oks: [], info: [], metrics: {} };
  if (!code.trim()) {
    res.errs.push('Редактор пуст — писать пока нечего.');
    return res;
  }
  const clean = stripPy(code);
  const lines = code.split('\n');
  const nonEmpty = lines.filter(l => l.trim() && !l.trim().startsWith('#'));

  res.metrics = {
    lines: nonEmpty.length,
    defs: (clean.match(/^[ \t]*def[ \t]+/gm) || []).length,
    loops: (clean.match(/^[ \t]*(for|while)\b/gm) || []).length,
    returns: (clean.match(/\breturn\b/g) || []).length,
    conds: (clean.match(/^[ \t]*if\b/gm) || []).length,
    chars: code.length
  };

  /* 1. синтаксис (реальный, если ядро готово) */
  if (py && pyState === 'ready') {
    const syn = await pySyntaxOnly(code);
    if (syn) {
      res.errs.push(`Синтаксическая ошибка (строка ${syn.line ?? '?'}): ${syn.msg}` + (syn.text ? ` → <code>${esc(syn.text)}</code>` : ''));
      return res;
    }
    res.oks.push('Синтаксис корректен (проверено интерпретатором).');
  } else {
    const bal = bracketBalance(code);
    if (!bal.ok) res.errs.push('Скобки: ' + bal.msg);
    const defRe = /^[ \t]*def[ \t]+[A-Za-z_][A-Za-z_0-9]*[ \t]*\(/gm;
    if ((defRe.test(clean)) === false && /^[ \t]*(if|for|while|else|elif|return|def)[ \t]/m.test(clean)) {
      const m = clean.match(/^[ \t]*(if|for|while|else|elif|return|def)([^\n]*)$/m);
      if (m && /[A-Za-z_)]$/.test(m[2].trim())) res.errs.push(`После «${m[1]}» на строке «${m[2].trim()}» не хватает двоеточия «:».`);
    }
    res.info.push('Ядро не загружено — синтаксис проверен приближённо, без интерпретатора.');
  }

  /* 2. обязательные функции */
  const defs = findDefs(code);
  for (const need of (task.req || [])) {
    if (defs.includes(need)) { res.oks.push(`Функция <code>${esc(need)}</code> объявлена.`); continue; }
    let best = null, bestD = 99;
    for (const d of defs) { const dist = levenshtein(d, need); if (dist < bestD) { bestD = dist; best = d; } }
    if (best && bestD <= Math.max(2, Math.floor(need.length / 3)))
      res.errs.push(`Ожидается функция <code>${esc(need)}</code>, а объявлена <code>${esc(best)}</code> — похоже на опечатку в имени.`);
    else
      res.errs.push(`Не найдена обязательная функция <code>${esc(need)}</code>. Тесты вызывают именно её.`);
  }

  /* 3. return */
  if ((task.req || []).length && res.metrics.returns === 0)
    res.errs.push('В коде нет ни одного <code>return</code> — функция ничего не возвращает, тесты получат <code>None</code>.');

  /* 4. частые грабли */
  const pitfalls = [
    { re: /^\s*if\s+[A-Za-z_][\w.]*\s*=\s*[^=]/m, msg: 'В условии <code>if</code> использован <code>=</code> вместо сравнения <code>==</code>.' },
    { re: /[^\s&]&&\s|[^\s|]\|\|\s/, msg: 'В Python нет операторов <code>&&</code> и <code>||</code> — используйте <code>and</code> и <code>or</code>.' },
    { re: /[;{]\s*\S/, msg: 'В Python нет фигурных скобок для блоков и точек с запятой между командами — используйте отступы и <code>:</code>.' },
    { re: /^\s*(True|False|None)\s*=[^=]/m, msg: 'Значения <code>True</code>/<code>False</code>/<code>None</code> нельзя присваивать.' },
    { re: /^\s*def\s+\w+\([^)]*\)\s*(?!:)/m, msg: 'После сигнатуры функции <code>def</code> должно идти двоеточие <code>:</code>.' },
    { re: /\b(int|float|str|bool)\s+\w+\s*=\s*/, msg: 'Тип указывать не нужно: просто <code>x = 0</code>. Тип в Python определяется по значению.' },
    { re: /\bfor\s*\(/, msg: 'В Python цикл пишется без скобок: <code>for i in range(n):</code>.' },
    { re: /\+\+|--/, msg: 'Инкремента <code>++</code>/<code>--</code> в Python нет — пишите <code>x += 1</code>.' }
  ];
  for (const p of pitfalls) if (p.re.test(code)) res.warns.push(p.msg);

  /* 5. отступы */
  const indents = lines.filter(l => l.trim() && !l.trim().startsWith('#')).map(l => (l.match(/^[ \t]+/) || [''])[0]);
  if (indents.some(s => s.includes('\t')) && indents.some(s => s.includes(' ') && !s.includes('\t')))
    res.warns.push('Смешаны табуляции и пробелы в отступах — Python может ругаться на <code>IndentationError</code>. Лучше везде по 4 пробела.');
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1], cur = lines[i];
    if (prev.trim().startsWith('#')) continue;
    if (/:\s*$/.test(prev) && cur.trim() && (cur.match(/^[ \t]*/) || [''])[0].length === 0)
      res.errs.push(`Строка ${i + 1}: после «<code>${esc(prev.trim().slice(0, 40))}</code>» тело блока не сдвинуто вправо.`);
  }

  /* 6. бесконечные циклы */
  const hang = findHangLoop(code);
  if (hang)
    res.warns.push('⛔ Найден ' + esc(hang) + '. <b>ЗАПУСК</b> такой код не выполнит — иначе вкладку не разбудить.');

  /* 7. консольный режим */
  const hasInput = /\binput\s*\(/.test(code), hasPrint = /\bprint\s*\(/.test(code);
  if (task.stdin && !hasInput) res.warns.push('Задача консольная: данные надо считать через <code>input()</code>.');
  if (!task.stdin && hasInput) res.warns.push('В этой задаче ввод не используется — вызывать <code>input()</code> не нужно.');
  if (!task.stdin && !hasPrint && (task.req || []).length) res.oks.push('Код не печатает ничего лишнего — хорошо, задача просит только возвращать значение.');

  /* 8. вызовы несуществующих функций */
  if (res.metrics.defs === 0 && (task.req || []).length) res.errs.push('Не найдено ни одного <code>def</code> — код вне функций не примет вызов из тестов.');
  const BUILTINS = ['print','len','int','str','float','bool','list','dict','set','frozenset','sum','min','max','abs',
    'round','range','sorted','reversed','enumerate','zip','isinstance','type','chr','ord','map','filter','input',
    'pow','divmod','repr','any','all','tuple','exit','open','bin','hex','oct','hash','id','iter','next','callable',
    'getattr','setattr','hasattr','format','find','index','count','replace','split','join','strip','upper','lower',
    'startswith','endswith','isdigit','isupper','islower','title','capitalize','append','extend','pop','insert',
    'remove','sort','reverse','keys','values','items','get','update','copy','add','discard','isdigit','title'];
  const shortNames = ['self','e','f','g','x','y','i','n','k','t','v','s','d','a','b','c','m','l','p','q','r','w'];
  /* методы вида s.strip() пропускаем — отсекаем всё, перед чем стоит точка */
  const isMethod = new Set();
  {
    const re = /\.([A-Za-z_]\w*)[ \t]*\(/g;
    let m;
    while ((m = re.exec(code))) isMethod.add(m[1]);
  }
  const ghost = findCalls(code)
    .filter(c => !defs.includes(c) && !PY_KEYWORDS.includes(c) && !BUILTINS.includes(c) && !isMethod.has(c));
  if (ghost.length)
    res.warns.push('В коде вызываются функции, которые нигде не определены и не являются встроенными: ' +
      ghost.slice(0, 6).map(c => `<code>${esc(c)}()</code>`).join(', ') +
      ' — похоже на опечатку в имени. Встроенные: print, len, sum, range, sorted, max, min, abs и т. п.');

  /* 9. метрики */
  res.oks.push(`Разбор: ${res.metrics.lines} строк, функций: ${res.metrics.defs}, циклов: ${res.metrics.loops}, условий: ${res.metrics.conds}, <code>return</code>: ${res.metrics.returns}.`);
  if (res.metrics.lines > 40) res.warns.push('Код получился длинным — возможно, стоит разбить его на функции или упростить решение.');
  const iterTask = /циклы|списк|словар/i.test(task.tag || '');
  if (iterTask && res.metrics.loops === 0 && !/\b(sum|sorted|reversed|max|min|len|\.count|\.index|\.split|\.join)\s*\(/.test(clean))
    res.info.push('Задача про перебор коллекции, а циклов и подходящих встроенных функций в коде нет.');
  return res;
}

/* ============================= 6. UI ==================================== */
const editor = $('#editor'), gutter = $('#gutter'), consoleEl = $('#console');
const asstLog = $('#asstLog');
const taskPanel = $('#taskPanel');
let curId = 1, taskTimer = null, taskStart = 0, sessionStart = nowMs();
let lastTests = [];

const taskById = id => TASKS[id - 1];

function log(cls, tag, text) {
  const d = new Date();
  const line = document.createElement('div');
  line.className = 'log-line ' + cls;
  line.innerHTML = `<span class="t">${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}</span><span class="m">${tag ? `<span class="tag ${tag.cls}">${tag.txt}</span>` : ''}${text}</span>`;
  consoleEl.appendChild(line);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}
const logInfo = (t) => log('log-info', null, t);
const logWarn = (t) => log('log-warn', null, t);
const logErr  = (t) => log('log-err', null, t);
const logSys  = (t) => log('log-sys', null, t);
const logHead = (t) => log('log-head', null, `<b>${t}</b>`);

/* сообщение в журнал оператора (справа). Всё считается локально. */
function sysMsg(html) {
  const d = document.createElement('div');
  d.className = 'msg sys';
  d.innerHTML = '<span class="who">СИСТЕМА</span>' + html;
  asstLog.appendChild(d);
  asstLog.scrollTop = asstLog.scrollHeight;
  return d;
}

/* ---------- sidebar ---------- */
function renderTaskList() {
  const q = $('#taskSearch').value.trim().toLowerCase();
  const lv = $('#levelChips .chip.active').dataset.level;
  const cur = firstUnsolved();
  const html = [];
  let lastLv = 0;
  for (let i = 0; i < TOTAL; i++) {
    const t = TASKS[i];
    if (q && !(t.n.toLowerCase().includes(q) || t.tag.toLowerCase().includes(q) || String(t.id).includes(q))) continue;
    if (lv !== 'all' && t.lv !== Number(lv)) continue;
    if (t.lv !== lastLv) { lastLv = t.lv; html.push(`<div class="level-sep">L${t.lv} // ${LV_NAMES[t.lv]}</div>`); }
    const unlocked = isUnlocked(t.id);
    const done = !!P.solved[t.id];
    const current = t.id === curId;
    const hasCode = !!(P.code[t.id] || '').trim();
    html.push(
      `<div class="task-item ${done ? 'done' : ''} ${unlocked ? '' : 'locked'} ${current ? 'current' : ''}" data-id="${t.id}">
        <span class="num">${String(t.id).padStart(2, '0')}</span>
        <span class="name">${esc(t.n)}</span>
        <span class="mark">${done ? '✔' : ''}${hasCode && !done ? '<i class="code-dot">·</i>' : ''}</span>
      </div>`
    );
  }
  $('#taskList').innerHTML = html.join('');
  $$('.task-item', $('#taskList')).forEach(el => el.addEventListener('click', () => {
    const id = Number(el.dataset.id);
    if (!isUnlocked(id)) {
      toast(`▣ Задача ${String(id).padStart(2, '0')} заблокирована. Сначала решите задачу ${String(cur).padStart(2, '0')} — перепрыгивать нельзя.`, 'warn');
      return;
    }
    openTask(id);
  }));
}

function renderAll() {
  renderTaskList();
  renderFirstSteps();
  const n = solvedCount();
  $('#statSolved').textContent = n;
  $('#statLevel').textContent = pad2(Math.min(10, Math.ceil(Math.max(firstUnsolved(), 1) / 10)));
  $('#statStreak').textContent = P.stats.streak;
  $('#progressFill').style.width = (n / TOTAL * 100) + '%';
}

/* ---------- gutter ---------- */
function renderGutter(errorLine) {
  const lines = editor.value.split('\n');
  const curLine = editor.value.slice(0, editor.selectionStart).split('\n').length;
  gutter.innerHTML = lines.map((_, i) =>
    `<div class="${i + 1 === curLine ? 'cur' : ''} ${i + 1 === errorLine ? 'err' : ''}">${i + 1}</div>`
  ).join('');
  gutter.scrollTop = editor.scrollTop;
  $('#editorStats').textContent = `${editor.value.split('\n').length} строк · ${editor.value.length} символов`;
}

/* ---------- открытие задачи ---------- */
function openTask(id, focusEditor = true) {
  if (!P) return;
  if (!isUnlocked(id) && id !== firstUnsolved()) { toast('Задача заблокирована', 'warn'); return; }
  const t = taskById(id);
  if (!t) return;
  if (taskTimer) clearInterval(taskTimer);
  if (curId && curId !== id && taskStart) {
    P.stats.timeMs += nowMs() - taskStart;
  }
  curId = id; taskStart = nowMs(); P.current = id; saveProfile();

  $('#taskIndex').textContent = 'ЗАДАЧА ' + String(id).padStart(3, '0') + ' / ' + id;
  $('#taskLevel').textContent = 'LVL ' + t.lv;
  $('#taskTag').textContent = t.tag;
  $('#taskSource').textContent = 'bank-100';
  $('#taskTitle').textContent = t.n;
  $('#taskDesc').innerHTML = t.task;
  if (t.sig) { $('#taskSignature').hidden = false; $('#sigCode').textContent = t.sig; }
  else $('#taskSignature').hidden = true;
  taskPanel.classList.toggle('solved', !!P.solved[id]);
  $('#btnSolution').disabled = false;

  editor.value = P.code[id] || '';
  renderGutter(); renderTaskList();
  lastTests = [];
  $('#testBadge').textContent = 'тесты не запускались';
  $('#testBadge').className = 'test-badge';
  $('#hintBox').hidden = true;
  $('#solutionBox').hidden = true;
  logHead(`ЗАДАЧА ${String(id).padStart(2, '0')} // ${t.n}`);
  logInfo(`Условие загружено. Обязательная функция: ${(t.req || []).join(', ') || 'консольный скрипт'}${P.solved[id] ? ' — <b>уже решена, можно переписать</b>' : ''}`);
  if (focusEditor) editor.focus();
  startTimer();
}

function startTimer() {
  const el = $('#taskTimer');
  clearInterval(taskTimer);
  const upd = () => {
    const s = Math.floor((nowMs() - taskStart) / 1000);
    el.textContent = `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
  };
  upd();
  taskTimer = setInterval(upd, 1000);
}

/* ---------- сохранение кода ---------- */
let saveT = null;
editor.addEventListener('input', () => {
  renderGutter();
  clearTimeout(saveT);
  saveT = setTimeout(() => { if (P) { P.code[curId] = editor.value; saveProfile(); renderTaskList(); } }, 400);
});
editor.addEventListener('scroll', () => { gutter.scrollTop = editor.scrollTop; gutter.scrollLeft = editor.scrollLeft; });
editor.addEventListener('click', () => renderGutter());
editor.addEventListener('keyup', (e) => { if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') renderGutter(); });
editor.addEventListener('keydown', e => {
  if (e.key === 'Tab') { e.preventDefault(); insert('    '); return; }
  if (e.key === 'Enter') {
    const pos = editor.selectionStart;
    const line = editor.value.slice(0, pos).split('\n').pop();
    const ind = (line.match(/^[ \t]*/) || [''])[0];
    e.preventDefault();
    insert('\n' + ind + (/:\s*$/.test(line) ? '    ' : ''));
    return;
  }
  if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); e.shiftKey ? runTests() : doCheck(); }
  function insert(text) {
    const s = editor.selectionStart, t = editor.selectionEnd;
    editor.value = editor.value.slice(0, s) + text + editor.value.slice(t);
    editor.selectionStart = editor.selectionEnd = s + text.length;
    renderGutter();
  }
});

/* ============================ ПРОВЕРКА ================================== */
async function doCheck() {
  if (!P) return;
  const t = taskById(curId);
  P.stats.checks++; saveProfile();
  logHead('ПРОВЕРКА // анализ без запуска');
  logInfo('Анализатор сканирует код: сигнатуры, скобки, отступы, подозрительные конструкции…');
  const r = await analyze(t);
  if (r.errs.length) r.errs.forEach(e => logErr('✖ ' + e));
  if (r.warns.length) r.warns.forEach(w => logWarn('▲ ' + w));
  r.oks.forEach(o => log('log-ok', null, '✔ ' + o));
  r.info.forEach(i => logInfo('• ' + i));

  const errCount = r.errs.length, warnCount = r.warns.length;
  if (errCount) logErr(`<b>Итог проверки:</b> найдено проблем: ${errCount}, предупреждений: ${warnCount}. Код пока не готов к запуску.`);
  else if (warnCount) logWarn(`<b>Итог проверки:</b> критичных ошибок нет, предупреждений: ${warnCount}.`);
  else log('log-ok', null, '<b>Итог проверки:</b> всё чисто. Жмите ЗАПУСК — код будет исполнен на тестах.');

  markGutterErr(null);

  sysMsg(`Локальный анализ задачи «${esc(t.n)}»: ошибок — <b>${errCount}</b>, предупреждений — <b>${warnCount}</b>.` +
    (errCount ? ' Сначала исправьте их, потом жмите «ЗАПУСК».' : ' Нажмите «ЗАПУСК», чтобы проверить ответ на тестах.'));

  renderTaskList();
}

/* --- предохранитель от зависания ----------------------------------------
   Код исполняется прямо на странице, и прервать зависший Python некому.
   Ищем самые частые способы повесить вкладку: цикл с заведомо истинным
   условием, внутри которого нет ни одного break. */
function condAlwaysTrue(cond) {
  const c = String(cond).trim().replace(/^\(+/, '').replace(/\)+$/, '').trim();
  if (!c) return false;
  if (c === 'True' || c === '1') return true;
  if (/^"[^"]+"$/.test(c) || /^'[^']+'$/.test(c)) return true;          // непустая строка
  if (/^\d+\.\d+$/.test(c)) return true;                                  // например 0.5
  if (/^\[[^\]]+\]$/.test(c) || /^\{[^{}]+\}$/.test(c)) return true;       // непустой список/словарь
  return false;
}

function findHangLoop(code) {
  const lines = stripPy(code).split('\n');
  const indOf = (s) => s.match(/^[ \t]*/)[0].replace(/\t/g, '    ').length;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([ \t]*)while\b([^\n]*)$/);
    if (!m) continue;
    const cond = m[2].replace(/:\s*$/, '').replace(/\s+#.*$/, '').trim();
    if (!condAlwaysTrue(cond)) continue;
    const base = indOf(lines[i]);
    let hasBreak = false;
    for (let j = i + 1; j < lines.length; j++) {
      const ln = lines[j];
      if (!ln.trim()) continue;
      if (indOf(ln) <= base) break;                                       // тело закончилось
      if (/(^|[^A-Za-z_0-9])break([^A-Za-z_0-9]|$)/.test(ln)) { hasBreak = true; break; }
    }
    if (!hasBreak) return `цикл «while ${cond}:» без break — он никогда не закончится`;
  }
  return null;
}

/* ============================= ЗАПУСК =================================== */
async function runTests() {
  if (!P) return;
  const t = taskById(curId);
  P.stats.runs++; saveProfile();
  $('#testBadge').textContent = 'выполнение…';
  $('#testBadge').className = 'test-badge';

  if (!py || pyState === 'error') {
    if (pyState === 'error') { logErr('⚠ Python-ядро недоступно: не удалось скачать его с CDN. Нужен интернет при первом открытии — проверьте соединение и обновите страницу.'); }
    else { logInfo('Ядро ещё грузится, запуск невозможен. Дождитесь статуса «python 3.12 online».'); }
    $('#testBadge').textContent = 'ядро недоступно';
    $('#testBadge').className = 'test-badge fail';
    return;
  }
  if (pyState !== 'ready') {
    logInfo('Ядро ещё занято — подождите пару секунд и повторите ЗАПУСК.');
    $('#testBadge').textContent = 'ядро занято';
    $('#testBadge').className = 'test-badge fail';
    return;
  }

  /* Код исполняется прямо на странице, и остановить зависший цикл некому.
     Поэтому перед запуском ловим самые частые способы повесить вкладку. */
  const hang = findHangLoop(editor.value);
  if (hang) {
    logErr('⛔ ЗАПУСК ЗАБЛОКИРОВАН: ' + esc(hang));
    logInfo('Такой код заморозит вкладку — остановить его будет нечем. Исправьте и запустите снова.');
    $('#testBadge').textContent = 'риск зависания';
    $('#testBadge').className = 'test-badge fail';
    P.stats.streak = 0; saveProfile(); renderAll();
    return;
  }

  logHead('ЗАПУСК // выполнение тестов');
  logInfo(`Код компилируется в интерпретаторе Python 3.12, затем прогоняется по ${t.tests.length} тест(ам) в изолированном окружении.`);
  const { data, error } = await pyRunTests(editor.value, t.tests);
  markGutterErr(null);

  if (error) {
    logErr('Сбой ядра: ' + esc(error));
    $('#testBadge').textContent = 'сбой ядра';
    $('#testBadge').className = 'test-badge fail';
    return;
  }
  if (data.syntax) {
    logErr(`✖ Синтаксическая ошибка (строка ${data.syntax.line ?? '?'}): ${esc(data.syntax.msg)}` + (data.syntax.text ? `\n&nbsp;&nbsp;&nbsp;&nbsp;${esc(data.syntax.text)}` : ''));
    markGutterErr(data.syntax.line);
    $('#testBadge').textContent = 'синтаксическая ошибка';
    $('#testBadge').className = 'test-badge fail';
    P.stats.streak = 0; saveProfile(); renderAll();
    return;
  }

  lastTests = data.tests;
  let passed = 0, firstFail = null;
  data.tests.forEach((r, i) => {
    const src = typeof t.tests[i] === 'string' ? t.tests[i] : t.tests[i].code;
    if (r.ok) {
      passed++;
      log('log-ok log-pass', { cls: 'OK', txt: 'PASS' },
        `тест ${i + 1}/${data.tests.length} пройден${r.note ? ` — <i>${esc(r.note)}</i>` : ''}`);
    } else {
      if (!firstFail) firstFail = { i, r, src };
      log('log-err log-pass', { cls: 'FAIL', txt: 'FAIL' }, `тест ${i + 1}/${data.tests.length} провален${r.note ? ` — <i>${esc(r.note)}</i>` : ''}`);
      if (r.kind === 'assert') logErr('&nbsp;&nbsp;↳ ' + esc(r.msg).replace(/\n/g, '<br>'));
      else if (r.kind === 'runtime') logErr(`&nbsp;&nbsp;↳ ${esc(r.etype)}: ${esc(r.msg)}` + (r.line ? ` <span style="color:var(--txt-faint)">(строка ${r.line})</span>` : ''));
      else if (r.kind === 'syntax') logErr(`&nbsp;&nbsp;↳ синтаксис: ${esc(r.msg)}`);
    }
    if (r.stdout && r.stdout.trim()) logOut(r.stdout.trim());
  });

  $('#testBadge').textContent = `${passed}/${data.tests.length} тестов пройдено`;
  $('#testBadge').className = 'test-badge ' + (passed === data.tests.length ? 'ok' : 'fail');

  if (data.ok) {
    log('log-ok', null, '<b>═══ ВСЕ ТЕСТЫ ПРОЙДЕНЫ ═══</b>');
    onSolved(t);
  } else {
    P.stats.streak = 0; saveProfile(); renderAll();
    logWarn('Задача не засчитана. Разберите падение и попробуйте снова.');
    if (firstFail) {
      sysMsg(`Упал тест №${firstFail.i + 1} из ${data.tests.length}. ` +
        (firstFail.r.kind === 'assert' ? `Сообщение: ${esc(firstFail.r.msg)}`
          : firstFail.r.kind === 'runtime' ? `Ошибка: ${esc(firstFail.r.etype)}: ${esc(firstFail.r.msg)}` : 'Ошибка выполнения.') +
        ` Подсказка — над условием, список граблей — кнопка «крайние случаи» справа.`);
    }
  }
}
function logOut(text) { log('log-out', null, esc(text)); }
function markGutterErr(line) { renderGutter(line); }

function onSolved(t) {
  const wasSolved = !!P.solved[curId];
  const timeSpent = nowMs() - taskStart;
  P.stats.timeMs += timeSpent; taskStart = nowMs();
  if (!wasSolved) {
    P.solved[curId] = { at: nowMs(), ms: timeSpent };
    P.stats.streak += 1;
    P.stats.best = Math.max(P.stats.best, P.stats.streak);
  }
  saveProfile(); renderAll();
  const badge = $('#testBadge');
  if (!wasSolved) {
    taskPanel.classList.add('solved');
    toast(`✔ Задача ${String(curId).padStart(2, '0')} засчитана · ${fmtDuration(timeSpent)} · серия ${P.stats.streak}`, 'ok', true);
    const next = firstUnsolved();
    if (next > TOTAL) {
      toast('🏆 ВСЕ 100 ЗАДАЧ РЕШЕНЫ. Оператор — легенда нетруннёйда.', 'ok', true);
      sysMsg('<b>ПРОТОКОЛ ЗАВЕРШЁН.</b> Все 100 задач пройдены. Локальная статистика сохранена в профиле.');
    } else if (t.lv < Math.ceil(next / 10)) {
      toast(`▲ УРОВЕНЬ ПОВЫШЕН: L${Math.ceil(next / 10)} // ${LV_NAMES[Math.ceil(next / 10)]}`, 'ok', true);
      taskPanel.classList.add('levelup');
      setTimeout(() => taskPanel.classList.remove('levelup'), 1200);
    }
    setTimeout(() => { if (firstUnsolved() > curId) openTask(firstUnsolved(), false); }, 2000);
  } else {
    toast('✔ Тесты пройдены (задача уже была засчитана)', 'ok');
  }
}

/* ------------------------- кнопки панели задачи ------------------------ */
$('#btnHint').addEventListener('click', () => {
  const t = taskById(curId);
  const box = $('#hintBox');
  box.hidden = !box.hidden;
  if (box.hidden) return;
  if (!P.solved[curId]) P.stats.hints++, saveProfile();
  box.innerHTML = t.hint;
});
$('#btnSolution').addEventListener('click', () => {
  const t = taskById(curId);
  const box = $('#solutionBox');
  box.hidden = !box.hidden;
  if (box.hidden) return;
  if (!t.sol) { box.innerHTML = 'Для этого задания эталонного решения нет — работай по подсказкам.'; return; }
  if (!P.solved[curId]) P.stats.reveals++, saveProfile();
  $('#solutionCode').textContent = t.sol;
  logSys('Показан эталон из встроенного банка. Задача не засчитывается, пока тесты не пройдут на твоём коде.');
});
$('#btnClear').addEventListener('click', () => {
  if (!editor.value.trim() || confirm('Очистить редактор?')) { editor.value = ''; P.code[curId] = ''; saveProfile(); renderGutter(); renderTaskList(); editor.focus(); }
});
$('#btnFormat').addEventListener('click', () => {
  const code = editor.value.split('\n').map(l => l.replace(/\t/g, '    ')).join('\n');
  editor.value = code; P.code[curId] = code; saveProfile(); renderGutter();
  logInfo('Табуляции заменены на 4 пробела.');
});
$('#btnClearLog').addEventListener('click', () => consoleEl.innerHTML = '');
$('#btnCheck').addEventListener('click', doCheck);
$('#btnRun').addEventListener('click', runTests);

/* ---- локальные быстрые действия журнала (никаких внешних сервисов) ---- */
async function localReview() {
  const t = taskById(curId);
  if (!editor.value.trim()) return sysMsg('В редакторе пусто — нечего разбирать.');
  const r = await analyze(t);
  const bad = [...r.errs, ...r.warns];
  sysMsg(`<b>Разбор кода (локальный анализатор).</b> Строк: ${r.metrics.lines}, функций: ${r.metrics.defs}, циклов: ${r.metrics.loops}, условий: ${r.metrics.conds}.` +
    (bad.length
      ? ' Замечания:<br>' + bad.slice(0, 5).map(x => '• ' + x).join('<br>')
      : ' Замечаний нет.'));
  if (r.oks.length) sysMsg('✔ ' + r.oks.slice(0, 3).join('<br>✔ '));
}
function localEdges() {
  const t = taskById(curId);
  sysMsg(`<b>Грабли по теме «${esc(t.tag)}».</b> Прогони решение на таких входах:` +
    '<br>' + edgesFor(t).map(x => '• ' + esc(x)).join('<br>') +
    (lastTests.length ? `<br>Тестов в наборе: ${lastTests.length}.` : ''));
}
function localRef() {
  const t = taskById(curId);
  const box = $('#solutionBox');
  box.hidden = false;
  if (!t.sol) { box.innerHTML = 'Для этого задания эталона нет.'; return; }
  if (!P.solved[curId]) P.stats.reveals++, saveProfile();
  $('#solutionCode').textContent = t.sol;
  sysMsg('Эталон показан в блоке под условием. Это подсказка, а не сдача — засчитает только твой код, прошедший тесты.');
}
$$('.qbtn').forEach(b => b.addEventListener('click', () => {
  if (!P) return;
  const a = b.dataset.act;
  if (a === 'review') localReview();
  else if (a === 'edges') localEdges();
  else if (a === 'ref') localRef();
  else if (a === 'stats') openProfile();
}));

/* --------------------------- поиск / фильтр ---------------------------- */
$('#taskSearch').addEventListener('input', renderTaskList);
$$('#levelChips .chip').forEach(c => c.addEventListener('click', () => {
  $$('#levelChips .chip').forEach(x => x.classList.remove('active'));
  c.classList.add('active');
  renderTaskList();
}));

/* ------------------------------ тосты ---------------------------------- */
function toast(text, kind = '', big = false) {
  const d = document.createElement('div');
  d.className = 'toast ' + kind + (big ? ' big' : '');
  d.textContent = text;
  $('#toastWrap').appendChild(d);
  setTimeout(() => { d.style.transition = 'opacity .4s, transform .4s'; d.style.opacity = '0'; d.style.transform = 'translateX(20px)'; }, 3800);
  setTimeout(() => d.remove(), 4300);
}

/* --------------------------- журнал оператора ---------------------------- */
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  $('#profileModal').hidden = true;
  if (!$('#introModal').hidden) closeIntro();
});
window.addEventListener('beforeunload', saveProfile);
setInterval(() => { if (P) { P.stats.timeMs += 0; saveProfile(); } }, 30000);

/* ============================== 8. BOOT ================================= */
function boot() {
  const lines = $('#bootLines');
  const script = [
    '> инициализация ядра <b>neon//py</b> …',
    '> монтирование локального хранилища … <b>ok</b>',
    '> загрузка банка заданий: <b>100</b> шт. …',
    '> проверка целостности тестов … <b>ok</b>',
    '> загрузка эталонных решений: <b>100</b> шт. … <b>ok</b>',
    '> канал в интернет: <b>закрыт</b> (данные остаются на устройстве)',
    '> ожидание идентификации оператора …'
  ];
  script.forEach((s, i) => {
    const d = document.createElement('div');
    d.innerHTML = s; d.style.animationDelay = (i * 170) + 'ms';
    lines.appendChild(d);
  });
  /* страховка: экран входа показываем в любом случае, даже если что-то
     выше упало — иначе пользователь видит вечную заставку и не понимает почему */
  const showAuth = () => {
    try {
      renderAuth();
      authScreen.hidden = false;
      $('#bootScreen').classList.add('hide');
      loginInput.focus();
    } catch (err) {
      fatal('экран входа не построился: ' + (err && err.message ? err.message : err));
      authScreen.hidden = false;
      $('#bootScreen').classList.add('hide');
    }
  };
  setTimeout(showAuth, 1150);
  setTimeout(() => { if (!$('#bootScreen').classList.contains('hide')) showAuth(); }, 4000);
  ensurePyodide();   // грузим ядро параллельно с вводом логина
}

boot();
