import { SimpleError } from "@simonbackx/simple-errors";
import XLSX from "xlsx";

import { ColumnMatcher } from "../ColumnMatcher";
import { ImportingMember } from "../ImportingMember";
import { MatcherCategory } from "../MatcherCategory";

export class PaidPriceColumnMatcher implements ColumnMatcher {
    id = "PaidPriceColumnMatcher"
    category: MatcherCategory = MatcherCategory.Payment

    getName(): string {
        return "Betaald (bedrag)"
    }

    doesMatch(columnName: string, examples: string[]): boolean {
        const cleaned = columnName.trim().toLowerCase()

        const possibleMatch = ["betaald", "payment"]

        for (const word of possibleMatch) {
            if (cleaned.includes(word)) {
                // check if the full name was really used, and not only the first or last name
                return this.areNumbersValues(examples)
            }
        }
        return false
    }

    areNumbersValues(examples: string[]) {
        for (const example of examples) {
            if (isNaN(parseFloat(example))) {
                return false
            }
        }
        return true
    }

    apply(cell: XLSX.CellObject | undefined, member: ImportingMember) {
        if (!cell) {
            member.registration.paidPrice = 0
            return
        }

        // Check if string value
        if (cell.t != "s" || typeof cell.v !== "string" || !cell.v) {
            throw new SimpleError({
                code: "invalid_type",
                message: "Geen tekst in deze cel"
            })
        }

        const value = cell.v.toLowerCase().trim()
        const b = parseFloat(value)
        
        if (isNaN(b)) {
             throw new SimpleError({
                code: "invalid_type",
                message: "'"+ value +"' is geen geldig bedrag",
            })
        }

        if (Math.floor(b*100) !== b*100 ) {
            throw new SimpleError({
                code: "invalid_type",
                message: "'"+ value +"' bevat te veel cijfers na de komma",
            })
        }

        member.registration.paidPrice = Math.floor(b * 100)
    }
}