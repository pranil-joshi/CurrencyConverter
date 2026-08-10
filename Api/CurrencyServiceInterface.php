<?php
declare(strict_types=1);

namespace Frankfurter\CurrencyConverter\Api;

use Frankfurter\CurrencyConverter\Model\Exception\FrankfurterApiException;

/**
 * Service contract for retrieving currency data from the Frankfurter exchange-rate API.
 */
interface CurrencyServiceInterface
{
    /**
     * Return the list of currencies Frankfurter supports, as [code => name].
     *
     * @return string[]
     * @throws FrankfurterApiException
     */
    public function getCurrencies(): array;

    /**
     * Return today's exchange rate for one unit of $from expressed in $to.
     *
     * @param string $from ISO currency code
     * @param string $to ISO currency code
     * @return array{date: string, rate: float}
     * @throws FrankfurterApiException
     */
    public function getLatestRate(string $from, string $to): array;

    /**
     * Return the daily exchange rate history for $from -> $to between two dates (inclusive).
     *
     * @param string $from ISO currency code
     * @param string $to ISO currency code
     * @param string $startDate Y-m-d
     * @param string $endDate Y-m-d
     * @return array<string, float> Date (Y-m-d) => rate
     * @throws FrankfurterApiException
     */
    public function getHistory(string $from, string $to, string $startDate, string $endDate): array;
}
