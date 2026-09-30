<?php
/**
 * Server-side input validation with the same shape the previous version used (schemas that describe each request).
 *
 *   $data = V::obj(['email' => V::str()->email(), 'age' => V::num()->int()->min(0)->optional()])->parse($input);
 *
 * Unknown keys are dropped; optional keys that are absent stay absent; problems become one AppError('VALIDATION') with
 * a message per field (dotted path for nested values), which the browser shows next to the field.
 */
defined('FEP') or exit;

final class V
{
    private string $kind;
    private array $o = [];

    private function __construct(string $kind, array $o = [])
    {
        $this->kind = $kind;
        $this->o = $o;
    }

    // ── constructors ──
    public static function str(): self { return new self('str', ['trim' => false]); }
    public static function num(): self { return new self('num'); }
    /** Accepts numeric strings too (query strings). */
    public static function coerceNum(): self { return new self('num', ['coerce' => true]); }
    public static function bool(): self { return new self('bool'); }
    public static function enum(array $values): self { return new self('enum', ['values' => array_values($values)]); }
    public static function arr(self $item): self { return new self('arr', ['item' => $item]); }
    public static function obj(array $shape): self { return new self('obj', ['shape' => $shape]); }
    public static function rec(self $value): self { return new self('rec', ['value' => $value]); }
    public static function any(): self { return new self('any'); }
    /** Any date-like input → normalised ISO string (like z.coerce.date()). */
    public static function date(): self { return new self('date'); }

    private function with(string $k, $v): self { $c = clone $this; $c->o[$k] = $v; return $c; }

    // ── modifiers ──
    public function optional(): self { return $this->with('optional', true); }
    public function nullable(): self { return $this->with('nullable', true); }
    public function nullish(): self { return $this->with('optional', true)->with('nullable', true); }
    public function default(mixed $v): self { return $this->with('default', $v)->with('hasDefault', true)->with('optional', true); }
    public function trim(): self { return $this->with('trim', true); }
    public function min(int|float $n): self { return $this->with('min', $n); }
    public function max(int|float $n): self { return $this->with('max', $n); }
    public function length(int $n): self { return $this->with('length', $n); }
    public function email(): self { return $this->with('email', true); }
    public function url(): self { return $this->with('url', true); }
    public function regex(string $re): self { return $this->with('regex', $re); }
    public function int(): self { return $this->with('int', true); }
    public function positive(): self { return $this->with('positive', true); }
    /** Custom check: fn($value): ?string returning an error message or null. */
    public function check(callable $fn): self { return $this->with('check', $fn); }

    // ── parsing ──
    public function parse(mixed $input): mixed
    {
        $errors = [];
        $out = $this->run($input, '', $errors, true);
        if ($errors) {
            throw new AppError('VALIDATION', 'Please check the highlighted fields.', $errors);
        }
        return $out;
    }

    private static function fail(array &$errors, string $path, string $msg): void
    {
        $errors[$path === '' ? '_' : $path] ??= $msg;
    }

    private static function absent(): object
    {
        static $a = null;
        return $a ??= new stdClass();
    }

    /** @return mixed value, or the `absent` marker when an optional value is missing */
    private function run(mixed $v, string $path, array &$errors, bool $top = false): mixed
    {
        if ($v === self::absent()) {
            if ($this->o['hasDefault'] ?? false) {
                return $this->o['default'];
            }
            if ($this->o['optional'] ?? false) {
                return self::absent();
            }
            self::fail($errors, $path, 'This field is required.');
            return null;
        }
        if ($v === null) {
            if ($this->o['nullable'] ?? false) {
                return null;
            }
            if ($this->o['hasDefault'] ?? false) {
                return $this->o['default'];
            }
            if ($this->o['optional'] ?? false) {
                return self::absent();
            }
            self::fail($errors, $path, 'This field is required.');
            return null;
        }
        $o = $this->o;
        switch ($this->kind) {
            case 'any':
                return $v;
            case 'str':
                if (!is_string($v)) {
                    self::fail($errors, $path, 'Enter text for this field.');
                    return null;
                }
                if ($o['trim'] ?? false) {
                    $v = trim($v);
                }
                $len = mb_strlen($v);
                if (isset($o['min']) && $len < $o['min']) {
                    self::fail($errors, $path, $o['min'] <= 1 ? 'This field is required.' : "Must be at least {$o['min']} characters.");
                }
                if (isset($o['max']) && $len > $o['max']) {
                    self::fail($errors, $path, "Must be at most {$o['max']} characters.");
                }
                if (isset($o['length']) && $len !== $o['length']) {
                    self::fail($errors, $path, "Must be exactly {$o['length']} characters.");
                }
                if (($o['email'] ?? false) && !preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u', $v)) {
                    self::fail($errors, $path, 'Enter a valid email address.');
                }
                if (($o['url'] ?? false) && !preg_match('#^https?://[^\s/$.?\#].[^\s]*$#i', $v)) {
                    self::fail($errors, $path, 'Enter a valid URL starting with http:// or https://');
                }
                if (isset($o['regex']) && !preg_match($o['regex'], $v)) {
                    self::fail($errors, $path, 'That value is not in the expected format.');
                }
                if (isset($o['check']) && ($msg = ($o['check'])($v))) {
                    self::fail($errors, $path, $msg);
                }
                return $v;
            case 'num':
                if (is_string($v) && ($o['coerce'] ?? false) && is_numeric($v)) {
                    $v = $v + 0;
                }
                if (!(is_int($v) || is_float($v)) || !is_finite((float)$v)) {
                    self::fail($errors, $path, 'Enter a number.');
                    return null;
                }
                if (($o['int'] ?? false) && floor((float)$v) != $v) {
                    self::fail($errors, $path, 'Enter a whole number.');
                }
                if (($o['positive'] ?? false) && $v <= 0) {
                    self::fail($errors, $path, 'Must be greater than zero.');
                }
                if (isset($o['min']) && $v < $o['min']) {
                    self::fail($errors, $path, "Must be at least {$o['min']}.");
                }
                if (isset($o['max']) && $v > $o['max']) {
                    self::fail($errors, $path, "Must be at most {$o['max']}.");
                }
                return ($o['int'] ?? false) ? (int)$v : $v;
            case 'bool':
                if (!is_bool($v)) {
                    self::fail($errors, $path, 'Must be true or false.');
                    return null;
                }
                return $v;
            case 'enum':
                if ((!is_string($v) && !is_int($v)) || !in_array($v, $o['values'], true)) {
                    self::fail($errors, $path, 'Choose one of the allowed values.');
                    return null;
                }
                return $v;
            case 'date':
                $ms = is_string($v) || is_int($v) || is_float($v) ? ts_ms($v) : null;
                if ($ms === null) {
                    self::fail($errors, $path, 'Enter a valid date.');
                    return null;
                }
                return iso_dt($ms);
            case 'arr':
                if (!is_array($v) || (!array_is_list($v) && $v !== [])) {
                    self::fail($errors, $path, 'Expected a list.');
                    return null;
                }
                $n = count($v);
                if (isset($o['min']) && $n < $o['min']) {
                    self::fail($errors, $path, "Add at least {$o['min']}.");
                }
                if (isset($o['max']) && $n > $o['max']) {
                    self::fail($errors, $path, "No more than {$o['max']} allowed.");
                }
                $out = [];
                foreach ($v as $i => $item) {
                    $r = $o['item']->run($item, $path === '' ? (string)$i : "{$path}.{$i}", $errors);
                    $out[] = $r === self::absent() ? null : $r;
                }
                return $out;
            case 'rec':
                if (!is_array($v) || ($v !== [] && array_is_list($v))) {
                    self::fail($errors, $path, 'Expected an object.');
                    return null;
                }
                $out = [];
                foreach ($v as $k => $item) {
                    $r = $o['value']->run($item, $path === '' ? (string)$k : "{$path}.{$k}", $errors);
                    if ($r !== self::absent()) {
                        $out[(string)$k] = $r;
                    }
                }
                return $out;
            case 'obj':
                if (!is_array($v) || ($v !== [] && array_is_list($v))) {
                    self::fail($errors, $path, 'Expected an object.');
                    return null;
                }
                $out = [];
                foreach ($o['shape'] as $key => $rule) {
                    $r = $rule->run(array_key_exists($key, $v) ? $v[$key] : self::absent(), $path === '' ? (string)$key : "{$path}.{$key}", $errors);
                    if ($r !== self::absent()) {
                        $out[$key] = $r;
                    }
                }
                if (isset($o['check']) && !$errors && ($msg = ($o['check'])($out))) {
                    self::fail($errors, $path, $msg);
                }
                return $out;
        }
        return $v;
    }
}
