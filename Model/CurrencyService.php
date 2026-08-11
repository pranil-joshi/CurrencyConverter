<?php
declare(strict_types=1);

namespace Frankfurter\CurrencyConverter\Model;

use Frankfurter\CurrencyConverter\Api\CurrencyServiceInterface;
use Frankfurter\CurrencyConverter\Model\Cache\Type as CurrencyCache;
use Frankfurter\CurrencyConverter\Model\Exception\FrankfurterApiException;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\HTTP\Client\CurlFactory;
use Magento\Framework\Serialize\Serializer\Json;
use Psr\Log\LoggerInterface;

/**
 * Retrieves currency lists, latest rates and rate history from the Frankfurter API,
 * caching responses to avoid hitting the remote service on every storefront request.
 */
class CurrencyService implements CurrencyServiceInterface
{
    private const XML_PATH_API_BASE_URL = 'frankfurter_currencyconverter/general/api_base_url';
    private const DEFAULT_API_BASE_URL = 'https://api.frankfurter.dev/v1/';
    private const CURRENCIES_CACHE_KEY = 'frankfurter_currencies';
    private const CURRENCIES_CACHE_LIFETIME = 86400;
    private const RATE_CACHE_LIFETIME = 300;
    private const MAX_ATTEMPTS = 2;

    public function __construct(
        private readonly CurlFactory $curlFactory,
        private readonly Json $json,
        private readonly CurrencyCache $cache,
        private readonly LoggerInterface $logger,
        private readonly ScopeConfigInterface $scopeConfig
    ) {
    }

    private function getApiBaseUrl(): string
    {
        $url = trim((string) $this->scopeConfig->getValue(self::XML_PATH_API_BASE_URL));

        if ($url === '') {
            return self::DEFAULT_API_BASE_URL;
        }

        return rtrim($url, '/') . '/';
    }

    /**
     * @inheritDoc
     */
    public function getCurrencies(): array
    {
        $cached = $this->cache->load(self::CURRENCIES_CACHE_KEY);
        if ($cached !== false) {
            return $this->json->unserialize($cached);
        }

        $currencies = $this->request('currencies');

        $this->cache->save(
            $this->json->serialize($currencies),
            self::CURRENCIES_CACHE_KEY,
            [CurrencyCache::CACHE_TAG],
            self::CURRENCIES_CACHE_LIFETIME
        );

        return $currencies;
    }

    /**
     * @inheritDoc
     */
    public function getLatestRate(string $from, string $to): array
    {
        [$from, $to] = $this->validatePair($from, $to);

        $cacheKey = 'frankfurter_latest_' . $from . '_' . $to;
        $cached = $this->cache->load($cacheKey);
        if ($cached !== false) {
            return $this->json->unserialize($cached);
        }

        $response = $this->request('latest', ['base' => $from, 'symbols' => $to]);

        if (!isset($response['rates'][$to], $response['date'])) {
            throw new FrankfurterApiException(__('Frankfurter API returned an unexpected response.'));
        }

        $result = [
            'date' => (string) $response['date'],
            'rate' => (float) $response['rates'][$to],
        ];

        $this->cache->save(
            $this->json->serialize($result),
            $cacheKey,
            [CurrencyCache::CACHE_TAG],
            self::RATE_CACHE_LIFETIME
        );

        return $result;
    }

    /**
     * @inheritDoc
     */
    public function getHistory(string $from, string $to, string $startDate, string $endDate): array
    {
        [$from, $to] = $this->validatePair($from, $to);
        $startDate = $this->validateDate($startDate);
        $endDate = $this->validateDate($endDate);

        $cacheKey = sprintf('frankfurter_history_%s_%s_%s_%s', $from, $to, $startDate, $endDate);
        $cached = $this->cache->load($cacheKey);
        if ($cached !== false) {
            return $this->json->unserialize($cached);
        }

        $response = $this->request($startDate . '..' . $endDate, ['base' => $from, 'symbols' => $to]);

        if (!isset($response['rates']) || !is_array($response['rates'])) {
            throw new FrankfurterApiException(__('Frankfurter API returned an unexpected response.'));
        }

        $history = [];
        foreach ($response['rates'] as $date => $rates) {
            if (is_array($rates) && isset($rates[$to])) {
                $history[$date] = (float) $rates[$to];
            }
        }
        ksort($history);

        $this->cache->save(
            $this->json->serialize($history),
            $cacheKey,
            [CurrencyCache::CACHE_TAG],
            self::RATE_CACHE_LIFETIME
        );

        return $history;
    }

    /**
     * @return array{0: string, 1: string}
     */
    private function validatePair(string $from, string $to): array
    {
        $from = strtoupper(trim($from));
        $to = strtoupper(trim($to));

        $available = $this->getCurrencies();

        if (!isset($available[$from])) {
            throw new FrankfurterApiException(__('"%1" is not a supported currency.', $from));
        }
        if (!isset($available[$to])) {
            throw new FrankfurterApiException(__('"%1" is not a supported currency.', $to));
        }

        return [$from, $to];
    }

    private function validateDate(string $date): string
    {
        $parsed = \DateTime::createFromFormat('Y-m-d', $date);
        if (!$parsed || $parsed->format('Y-m-d') !== $date) {
            throw new FrankfurterApiException(__('"%1" is not a valid date.', $date));
        }

        return $date;
    }

    /**
     * @param array<string, string> $params
     * @return array<mixed>
     */
    private function request(string $path, array $params = []): array
    {
        $url = $this->getApiBaseUrl() . $path;
        if ($params) {
            $url .= '?' . http_build_query($params);
        }

        $attempts = 0;
        do {
            $attempts++;

            $curl = $this->curlFactory->create();
            $curl->setTimeout(10);
            $curl->setOption(CURLOPT_CONNECTTIMEOUT, 5);

            try {
                $curl->get($url);
                $status = (int) $curl->getStatus();
                $body = $curl->getBody();

                if ($status >= 200 && $status < 300 && $body) {
                    $this->logger->info(sprintf('Frankfurter API request succeeded: %s (attempt %d)', $url, $attempts));
                    break;
                }

                $this->logger->error(sprintf('Frankfurter API returned HTTP %d for %s', $status, $url));
            } catch (\Exception $e) {
                $this->logger->error('Frankfurter API request failed: ' . $e->getMessage());
                $body = null;
            }

            if ($attempts >= self::MAX_ATTEMPTS) {
                throw new FrankfurterApiException(__('Unable to reach the currency exchange service.'));
            }
        } while (true);

        try {
            $decoded = $this->json->unserialize($body);
        } catch (\InvalidArgumentException $e) {
            throw new FrankfurterApiException(__('Frankfurter API returned an invalid response.'), $e);
        }

        if (!is_array($decoded)) {
            throw new FrankfurterApiException(__('Frankfurter API returned an invalid response.'));
        }

        return $decoded;
    }
}
