<?php
declare(strict_types=1);

namespace Frankfurter\CurrencyConverter\Controller\Index;

use Frankfurter\CurrencyConverter\Api\CurrencyServiceInterface;
use Frankfurter\CurrencyConverter\Model\Exception\FrankfurterApiException;
use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\Controller\Result\Json;
use Magento\Framework\Controller\ResultFactory;
use Psr\Log\LoggerInterface;

/**
 * AJAX endpoint returning the latest rate and rate history for a currency pair.
 */
class Rate implements HttpGetActionInterface
{
    private const MIN_HISTORY_DAYS = 7;
    private const MAX_HISTORY_DAYS = 365;
    private const DEFAULT_HISTORY_DAYS = 30;

    public function __construct(
        private readonly RequestInterface $request,
        private readonly ResultFactory $resultFactory,
        private readonly CurrencyServiceInterface $currencyService,
        private readonly LoggerInterface $logger
    ) {
    }

    public function execute(): Json
    {
        /** @var Json $result */
        $result = $this->resultFactory->create(ResultFactory::TYPE_JSON);

        $from = (string) $this->request->getParam('from', '');
        $to = (string) $this->request->getParam('to', '');
        $days = (int) $this->request->getParam('days', self::DEFAULT_HISTORY_DAYS);
        $days = max(self::MIN_HISTORY_DAYS, min(self::MAX_HISTORY_DAYS, $days));

        if ($from === '' || $to === '') {
            return $result->setHttpResponseCode(400)->setData([
                'error' => __('Both "from" and "to" currencies are required.')->render(),
            ]);
        }

        try {
            $latest = $this->currencyService->getLatestRate($from, $to);
            $endDate = new \DateTime($latest['date']);
            $startDate = (clone $endDate)->modify('-' . $days . ' days');

            $history = $this->currencyService->getHistory(
                $from,
                $to,
                $startDate->format('Y-m-d'),
                $endDate->format('Y-m-d')
            );

            return $result->setData([
                'from' => strtoupper($from),
                'to' => strtoupper($to),
                'date' => $latest['date'],
                'rate' => $latest['rate'],
                'history' => $history,
            ]);
        } catch (FrankfurterApiException $e) {
            return $result->setHttpResponseCode(502)->setData([
                'error' => $e->getMessage(),
            ]);
        } catch (\Exception $e) {
            $this->logger->error('Currency converter rate lookup failed: ' . $e->getMessage());

            return $result->setHttpResponseCode(500)->setData([
                'error' => __('Something went wrong. Please try again.')->render(),
            ]);
        }
    }
}
