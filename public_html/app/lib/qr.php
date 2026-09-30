<?php
/**
 * Small QR Code encoder (byte mode, error-correction level M, versions 1–10 → up to 213 bytes), returned as an inline SVG.
 * Used for the two-factor setup screen. No libraries, no image extension required.
 */
defined('FEP') or exit;

final class Qr
{
    // [total data codewords, ecc codewords per block, [[blocks, data codewords per block], ...]]  — level M
    private const BLOCKS = [
        1 => [10, [[1, 16]]], 2 => [16, [[1, 28]]], 3 => [26, [[1, 44]]], 4 => [18, [[2, 32]]], 5 => [24, [[2, 43]]],
        6 => [16, [[4, 27]]], 7 => [18, [[4, 31]]], 8 => [22, [[2, 38], [2, 39]]], 9 => [22, [[3, 36], [2, 37]]], 10 => [26, [[4, 43], [1, 44]]],
    ];

    private static array $exp = [];
    private static array $log = [];

    private static function gfInit(): void
    {
        if (self::$exp) {
            return;
        }
        $x = 1;
        for ($i = 0; $i < 255; $i++) {
            self::$exp[$i] = $x;
            self::$log[$x] = $i;
            $x <<= 1;
            if ($x & 0x100) {
                $x ^= 0x11D;
            }
        }
        for ($i = 255; $i < 512; $i++) {
            self::$exp[$i] = self::$exp[$i - 255];
        }
    }

    private static function mul(int $a, int $b): int
    {
        return ($a === 0 || $b === 0) ? 0 : self::$exp[self::$log[$a] + self::$log[$b]];
    }

    private static function rsGenerator(int $n): array
    {
        $g = array_fill(0, $n - 1, 0);
        $g[] = 1;
        $root = 1;
        for ($i = 0; $i < $n; $i++) {
            for ($j = 0; $j < $n; $j++) {
                $g[$j] = self::mul($g[$j], $root);
                if ($j + 1 < $n) {
                    $g[$j] ^= $g[$j + 1];
                }
            }
            $root = self::mul($root, 2);
        }
        return $g;
    }

    private static function rsRemainder(array $data, array $gen): array
    {
        $n = count($gen);
        $rem = array_fill(0, $n, 0);
        foreach ($data as $b) {
            $factor = $b ^ array_shift($rem);
            $rem[] = 0;
            foreach ($gen as $i => $coef) {
                $rem[$i] ^= self::mul($coef, $factor);
            }
        }
        return $rem;
    }

    /** @return bool[][] modules (true = dark) */
    public static function matrix(string $text): array
    {
        self::gfInit();
        $bytes = array_values(unpack('C*', $text) ?: []);
        $len = count($bytes);
        $version = 0;
        foreach (self::BLOCKS as $v => [$ecc, $groups]) {
            $cap = 0;
            foreach ($groups as [$nb, $dc]) {
                $cap += $nb * $dc;
            }
            $countBits = $v <= 9 ? 8 : 16;
            if (4 + $countBits + 8 * $len <= $cap * 8) {
                $version = $v;
                break;
            }
        }
        if (!$version) {
            throw new LengthException('QR text is too long');
        }
        [$ecc, $groups] = self::BLOCKS[$version];
        $cap = 0;
        foreach ($groups as [$nb, $dc]) {
            $cap += $nb * $dc;
        }
        // bit stream
        $bits = '0100' . str_pad(decbin($len), $version <= 9 ? 8 : 16, '0', STR_PAD_LEFT);
        foreach ($bytes as $b) {
            $bits .= str_pad(decbin($b), 8, '0', STR_PAD_LEFT);
        }
        $bits .= str_repeat('0', min(4, $cap * 8 - strlen($bits)));
        $bits .= str_repeat('0', (8 - strlen($bits) % 8) % 8);
        $data = array_map('bindec', str_split($bits, 8));
        for ($pad = 0xEC; count($data) < $cap; $pad ^= 0xEC ^ 0x11) {
            $data[] = $pad;
        }
        // split into blocks, add ECC, interleave
        $gen = self::rsGenerator($ecc);
        $blocks = [];
        $eccBlocks = [];
        $pos = 0;
        foreach ($groups as [$nb, $dc]) {
            for ($i = 0; $i < $nb; $i++) {
                $chunk = array_slice($data, $pos, $dc);
                $pos += $dc;
                $blocks[] = $chunk;
                $eccBlocks[] = self::rsRemainder($chunk, $gen);
            }
        }
        $all = [];
        $maxLen = max(array_map('count', $blocks));
        for ($i = 0; $i < $maxLen; $i++) {
            foreach ($blocks as $b) {
                if ($i < count($b)) {
                    $all[] = $b[$i];
                }
            }
        }
        for ($i = 0; $i < $ecc; $i++) {
            foreach ($eccBlocks as $b) {
                $all[] = $b[$i];
            }
        }

        $size = $version * 4 + 17;
        $m = array_fill(0, $size, array_fill(0, $size, false));
        $fn = array_fill(0, $size, array_fill(0, $size, false));
        $set = function (int $x, int $y, bool $dark) use (&$m, &$fn, $size) {
            if ($x >= 0 && $x < $size && $y >= 0 && $y < $size) {
                $m[$y][$x] = $dark;
                $fn[$y][$x] = true;
            }
        };
        for ($i = 0; $i < $size; $i++) {
            $set(6, $i, $i % 2 === 0);
            $set($i, 6, $i % 2 === 0);
        }
        foreach ([[3, 3], [$size - 4, 3], [3, $size - 4]] as [$cx, $cy]) {
            for ($dy = -4; $dy <= 4; $dy++) {
                for ($dx = -4; $dx <= 4; $dx++) {
                    $d = max(abs($dx), abs($dy));
                    $set($cx + $dx, $cy + $dy, $d !== 2 && $d !== 4);
                }
            }
        }
        $numAlign = intdiv($version, 7) + 2;
        $step = (int)(ceil(($version * 4 + 4) / ($numAlign * 2 - 2)) * 2);
        $pos = [];
        if ($version > 1) { // version 1 has no alignment pattern
            $pos = [6];
            for ($p = $size - 7; count($pos) < $numAlign; $p -= $step) {
                array_splice($pos, 1, 0, [$p]);
            }
        }
        foreach ($pos as $i => $ax) {
            foreach ($pos as $j => $ay) {
                if (($i === 0 && $j === 0) || ($i === 0 && $j === $numAlign - 1) || ($i === $numAlign - 1 && $j === 0)) {
                    continue;
                }
                for ($dy = -2; $dy <= 2; $dy++) {
                    for ($dx = -2; $dx <= 2; $dx++) {
                        $set($ax + $dx, $ay + $dy, max(abs($dx), abs($dy)) !== 1);
                    }
                }
            }
        }
        // reserve format + version areas as function modules (values written below)
        self::drawFormat($set, $size, 0);
        if ($version >= 7) {
            $rem = $version;
            for ($i = 0; $i < 12; $i++) {
                $rem = ($rem << 1) ^ (($rem >> 11) * 0x1F25);
            }
            $vbits = ($version << 12) | $rem;
            for ($i = 0; $i < 18; $i++) {
                $bit = (($vbits >> $i) & 1) === 1;
                $a = $size - 11 + $i % 3;
                $b = intdiv($i, 3);
                $set($a, $b, $bit);
                $set($b, $a, $bit);
            }
        }
        // place data
        $idx = 0;
        $total = count($all) * 8;
        for ($right = $size - 1; $right >= 1; $right -= 2) {
            if ($right === 6) {
                $right = 5;
            }
            for ($vert = 0; $vert < $size; $vert++) {
                for ($j = 0; $j < 2; $j++) {
                    $x = $right - $j;
                    $upward = (($right + 1) & 2) === 0;
                    $y = $upward ? $size - 1 - $vert : $vert;
                    if (!$fn[$y][$x] && $idx < $total) {
                        $m[$y][$x] = ((($all[$idx >> 3] >> (7 - ($idx & 7))) & 1) === 1);
                        $idx++;
                    }
                }
            }
        }
        // choose the best mask
        $best = null;
        $bestPenalty = PHP_INT_MAX;
        for ($mask = 0; $mask < 8; $mask++) {
            $t = $m;
            for ($y = 0; $y < $size; $y++) {
                for ($x = 0; $x < $size; $x++) {
                    if (!$fn[$y][$x] && self::maskBit($mask, $x, $y)) {
                        $t[$y][$x] = !$t[$y][$x];
                    }
                }
            }
            $setT = function (int $x, int $y, bool $dark) use (&$t, $size) {
                if ($x >= 0 && $x < $size && $y >= 0 && $y < $size) {
                    $t[$y][$x] = $dark;
                }
            };
            self::drawFormat($setT, $size, $mask);
            $pen = self::penalty($t, $size);
            if ($pen < $bestPenalty) {
                $bestPenalty = $pen;
                $best = $t;
            }
        }
        return $best;
    }

    private static function maskBit(int $mask, int $x, int $y): bool
    {
        return match ($mask) {
            0 => ($x + $y) % 2 === 0, 1 => $y % 2 === 0, 2 => $x % 3 === 0, 3 => ($x + $y) % 3 === 0,
            4 => (intdiv($x, 3) + intdiv($y, 2)) % 2 === 0, 5 => $x * $y % 2 + $x * $y % 3 === 0,
            6 => ($x * $y % 2 + $x * $y % 3) % 2 === 0, default => (($x + $y) % 2 + $x * $y % 3) % 2 === 0,
        };
    }

    private static function drawFormat(callable $set, int $size, int $mask): void
    {
        $data = (0 << 3) | $mask; // error-correction level M = 00
        $rem = $data;
        for ($i = 0; $i < 10; $i++) {
            $rem = ($rem << 1) ^ (($rem >> 9) * 0x537);
        }
        $bits = (($data << 10) | $rem) ^ 0x5412;
        $bit = fn(int $i) => (($bits >> $i) & 1) === 1;
        for ($i = 0; $i <= 5; $i++) {
            $set(8, $i, $bit($i));
        }
        $set(8, 7, $bit(6));
        $set(8, 8, $bit(7));
        $set(7, 8, $bit(8));
        for ($i = 9; $i < 15; $i++) {
            $set(14 - $i, 8, $bit($i));
        }
        for ($i = 0; $i < 8; $i++) {
            $set($size - 1 - $i, 8, $bit($i));
        }
        for ($i = 8; $i < 15; $i++) {
            $set(8, $size - 15 + $i, $bit($i));
        }
        $set(8, $size - 8, true);
    }

    private static function penalty(array $t, int $size): int
    {
        $p = 0;
        for ($pass = 0; $pass < 2; $pass++) {
            for ($a = 0; $a < $size; $a++) {
                $run = 1;
                $line = '';
                for ($b = 0; $b < $size; $b++) {
                    $cur = $pass ? $t[$b][$a] : $t[$a][$b];
                    $line .= $cur ? '1' : '0';
                    if ($b > 0) {
                        $prev = $pass ? $t[$b - 1][$a] : $t[$a][$b - 1];
                        if ($cur === $prev) {
                            $run++;
                            if ($run === 5) {
                                $p += 3;
                            } elseif ($run > 5) {
                                $p++;
                            }
                        } else {
                            $run = 1;
                        }
                    }
                }
                $p += 40 * (substr_count($line, '10111010000') + substr_count($line, '00001011101'));
            }
        }
        for ($y = 0; $y < $size - 1; $y++) {
            for ($x = 0; $x < $size - 1; $x++) {
                $c = $t[$y][$x];
                if ($c === $t[$y][$x + 1] && $c === $t[$y + 1][$x] && $c === $t[$y + 1][$x + 1]) {
                    $p += 3;
                }
            }
        }
        $dark = 0;
        foreach ($t as $row) {
            $dark += count(array_filter($row));
        }
        return $p + 10 * (int)floor(abs($dark * 20 / ($size * $size) - 10));
    }
}

/** Inline SVG (as a data: URL) of a QR code for $text, with a 2-module quiet zone. */
function qr_svg_data_url(string $text, int $px = 220): string
{
    $m = Qr::matrix($text);
    $n = count($m);
    $q = 2;
    $path = '';
    foreach ($m as $y => $row) {
        foreach ($row as $x => $dark) {
            if ($dark) {
                $path .= 'M' . ($x + $q) . ',' . ($y + $q) . 'h1v1h-1z';
            }
        }
    }
    $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' . ($n + 2 * $q) . ' ' . ($n + 2 * $q) . '" width="' . $px . '" height="' . $px . '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="' . $path . '" fill="#000"/></svg>';
    return 'data:image/svg+xml;base64,' . base64_encode($svg);
}
