package com.acme.payments;

import java.util.List;
import static java.util.Objects.requireNonNull;

// public class FakeInComment {}
public class PaymentService {
    private final Gateway gateway;

    public Result processPayment(Input input) throws PaymentException {
        Result r = chargeCard(input);
        if (!r.isOk()) {
            return recordFailure(input, r);
        }
        return r;
    }

    private void log(String msg) {
        System.out.println(msg);
    }
}

interface Gateway { }
