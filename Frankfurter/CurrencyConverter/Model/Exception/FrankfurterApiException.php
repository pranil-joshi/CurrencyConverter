<?php
declare(strict_types=1);

namespace Frankfurter\CurrencyConverter\Model\Exception;

use Magento\Framework\Exception\LocalizedException;

/**
 * Thrown when the Frankfurter API cannot be reached or returns an unexpected response.
 */
class FrankfurterApiException extends LocalizedException
{
}
