<?php
declare(strict_types=1);

namespace Frankfurter\CurrencyConverter\Block;

use Frankfurter\CurrencyConverter\Api\CurrencyServiceInterface;
use Frankfurter\CurrencyConverter\Model\Exception\FrankfurterApiException;
use Magento\Framework\Serialize\Serializer\Json;
use Magento\Framework\View\Element\Template;
use Magento\Framework\View\Element\Template\Context;
use Psr\Log\LoggerInterface;

/**
 * Storefront currency converter block: supplies the currency list and widget config to the template.
 */
class Converter extends Template
{
    private const DEFAULT_FROM = 'USD';
    private const DEFAULT_TO = 'EUR';
    private const DEFAULT_HISTORY_DAYS = 30;

    public function __construct(
        Context $context,
        private readonly CurrencyServiceInterface $currencyService,
        private readonly Json $json,
        private readonly LoggerInterface $logger,
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    /**
     * @return string[] Currency code => currency name
     */
    public function getCurrencies(): array
    {
        try {
            $currencies = $this->currencyService->getCurrencies();
            asort($currencies);

            return $currencies;
        } catch (FrankfurterApiException $e) {
            $this->logger->error('Unable to load currency list: ' . $e->getMessage());

            return [];
        }
    }

    public function getDefaultFrom(): string
    {
        return self::DEFAULT_FROM;
    }

    public function getDefaultTo(): string
    {
        return self::DEFAULT_TO;
    }

    public function getAjaxUrl(): string
    {
        return $this->getUrl('currencyconverter/index/rate');
    }

    public function getWidgetConfigJson(): string
    {
        return $this->json->serialize([
            'ajaxUrl' => $this->getAjaxUrl(),
            'defaultFrom' => $this->getDefaultFrom(),
            'defaultTo' => $this->getDefaultTo(),
            'historyDays' => self::DEFAULT_HISTORY_DAYS,
        ]);
    }
}
