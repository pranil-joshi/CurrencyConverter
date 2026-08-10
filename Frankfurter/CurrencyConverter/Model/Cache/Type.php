<?php
declare(strict_types=1);

namespace Frankfurter\CurrencyConverter\Model\Cache;

use Magento\Framework\App\Cache\Type\FrontendPool;
use Magento\Framework\Cache\Frontend\Decorator\TagScope;

/**
 * Dedicated cache type for Frankfurter API responses (currency list, rates, history),
 * so it can be viewed/flushed independently from admin Cache Management.
 */
class Type extends TagScope
{
    public const TYPE_IDENTIFIER = 'frankfurter_currency';
    public const CACHE_TAG = 'FRANKFURTER_CURRENCY';

    public function __construct(FrontendPool $cacheFrontendPool)
    {
        parent::__construct($cacheFrontendPool->get(self::TYPE_IDENTIFIER), self::CACHE_TAG);
    }
}
