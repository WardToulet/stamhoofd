export enum OrganizationType {
    Youth = "Youth",
    Football = "Football",
    Tennis = "Tennis",
    Golf = "Golf",
    Athletics = "Athletics",
    Badminton = "Badminton",
    Hockey = "Hockey",
    Cycling = "Cycling",
    Swimming = "Swimming",
    Dance = "Dance",
    Volleyball = "Volleyball",
    Basketball = "Basketball",
    Judo = "Judo",
    Sport = "Sport",
    School = "School",
    Student = "Student",
    HorseRiding = "HorseRiding",
    Neighborhood = "Neighborhood",
    Nature = "Nature",
    Music = "Music",
    Professional = "Professional",
    Art = "Art",
    Culture = "Culture",
    LGBTQ = "LGBTQ",
    Other = "Other",
}

export class OrganizationTypeHelper {
    static getList() {
        return [
            {
                value: OrganizationType.Youth,
                name: "Jeugdbeweging",
            },
            {
                value: OrganizationType.Football,
                name: "Voetbal",
            },
            {
                value: OrganizationType.Tennis,
                name: "Tennis",
            },
            {
                value: OrganizationType.Golf,
                name: "Golf",
            },
            {
                value: OrganizationType.Athletics,
                name: "Atletiek",
            },
            {
                value: OrganizationType.Badminton,
                name: "Badminton",
            },
            {
                value: OrganizationType.Hockey,
                name: "Hockey",
            },
            {
                value: OrganizationType.Cycling,
                name: "Wielrennen",
            },
            {
                value: OrganizationType.Swimming,
                name: "Zwemmen",
            },
            {
                value: OrganizationType.Dance,
                name: "Dans",
            },
            {
                value: OrganizationType.Volleyball,
                name: "Volleybal",
            },
            {
                value: OrganizationType.Basketball,
                name: "Basketbal",
            },
            {
                value: OrganizationType.Judo,
                name: "Vechtkunst",
            },
            {
                value: OrganizationType.Sport,
                name: "Andere sport",
            },
            {
                value: OrganizationType.Student,
                name: "Studentenvereniging",
            },
            {
                value: OrganizationType.HorseRiding,
                name: "Paardensport",
            },
            {
                value: OrganizationType.Neighborhood,
                name: "Buurtvereniging",
            },
            {
                value: OrganizationType.Nature,
                name: "Natuurvereniging",
            },
            {
                value: OrganizationType.Music,
                name: "Muziekvereniging",
            },
            {
                value: OrganizationType.Professional,
                name: "Beroepsvereniging",
            },
            {
                value: OrganizationType.Art,
                name: "Kunstvereniging",
            },
            {
                value: OrganizationType.Culture,
                name: "Cultuur",
            },
            {
                value: OrganizationType.LGBTQ,
                name: "LGBTQ+",
            },
            {
                value: OrganizationType.School,
                name: "School",
            },
            {
                value: OrganizationType.Other,
                name: "Andere",
            },
        ]
    }

    static getCategory(type: OrganizationType): string {
        switch (type) {
            case OrganizationType.Youth:
            case OrganizationType.Student:
                return "Jeugd";

            case OrganizationType.Sport:
            case OrganizationType.Football:
            case OrganizationType.Tennis:
            case OrganizationType.Golf:
            case OrganizationType.Athletics:
            case OrganizationType.Badminton:
            case OrganizationType.Hockey:
            case OrganizationType.Cycling:
            case OrganizationType.Swimming:
            case OrganizationType.Dance:
            case OrganizationType.Volleyball:
            case OrganizationType.Basketball:
            case OrganizationType.Judo:
            case OrganizationType.HorseRiding:
                return "Sport";

            

            case OrganizationType.Culture:
            case OrganizationType.Art:
            case OrganizationType.Music:
                return "Cultuur";


            case OrganizationType.Other:
            case OrganizationType.LGBTQ:
            case OrganizationType.Nature:
            case OrganizationType.Professional:
            case OrganizationType.Neighborhood:
            case OrganizationType.School:
                return "Overige";
        }
    }
}