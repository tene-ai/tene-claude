package payments

import (
	"fmt"
	pay "github.com/acme/pay"
)

// func fakeInComment() {}
var raw = `func alsoFake() {}`

func ProcessPayment(input Input) (Result, error) {
	r, err := chargeCard(input)
	if err != nil {
		return recordFailure(input, err)
	}
	return r, nil
}

func (s *PaymentService) Charge(amount int) error {
	return s.gateway.Send(amount)
}

type Input struct{ Amount int }
type Gateway interface{ Send(int) error }
