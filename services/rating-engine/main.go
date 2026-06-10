// Rating Engine — usage event rating (Stage 9).
package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
)

func main() {
	port := os.Getenv("RATING_ENGINE_PORT")
	if port == "" {
		port = "8092"
	}

	http.HandleFunc("/health/live", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"healthy","service":"rating-engine","stage":"scaffold"}`))
	})

	log.Printf("rating-engine scaffold listening on :%s", port)
	if err := http.ListenAndServe(fmt.Sprintf(":%s", port), nil); err != nil {
		log.Fatal(err)
	}
}
