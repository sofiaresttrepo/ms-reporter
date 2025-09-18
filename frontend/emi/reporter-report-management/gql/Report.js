import { gql } from 'apollo-boost';

export const ReporterReportListing = (variables) => ({
    query: gql`
            query ReporterReportListing($filterInput:ReporterReportFilterInput ,$paginationInput:ReporterReportPaginationInput,$sortInput:ReporterReportSortInput){
                ReporterReportListing(filterInput:$filterInput,paginationInput:$paginationInput,sortInput:$sortInput){
                    listing{
                       id,name,active,
                    },
                    queryTotalResultCount
                }
            }`,
    variables,
    fetchPolicy: 'network-only',
})

export const ReporterReport = (variables) => ({
    query: gql`
            query ReporterReport($id: ID!, $organizationId: String!){
                ReporterReport(id:$id, organizationId:$organizationId){
                    id,name,description,active,organizationId,
                    metadata{ createdBy, createdAt, updatedBy, updatedAt }
                }
            }`,
    variables,
    fetchPolicy: 'network-only',
})


export const ReporterCreateReport = (variables) => ({
    mutation: gql`
            mutation  ReporterCreateReport($input: ReporterReportInput!){
                ReporterCreateReport(input: $input){
                    id,name,description,active,organizationId,
                    metadata{ createdBy, createdAt, updatedBy, updatedAt }
                }
            }`,
    variables
})

export const ReporterDeleteReport = (variables) => ({
    mutation: gql`
            mutation ReporterReportListing($ids: [ID]!){
                ReporterDeleteReports(ids: $ids){
                    code,message
                }
            }`,
    variables
})

export const ReporterUpdateReport = (variables) => ({
    mutation: gql`
            ,mutation  ReporterUpdateReport($id: ID!,$input: ReporterReportInput!, $merge: Boolean!){
                ReporterUpdateReport(id:$id, input: $input, merge:$merge ){
                    id,organizationId,name,description,active
                }
            }`,
    variables
})

export const onReporterReportModified = (variables) => ([
    gql`subscription onReporterReportModified($id:ID!){
            ReporterReportModified(id:$id){    
                id,organizationId,name,description,active,
                metadata{ createdBy, createdAt, updatedBy, updatedAt }
            }
    }`,
    { variables }
])